import { access, cp, readFile, rm, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readAppMetadata } from "./appMetadata.mjs";
import { runReactNativeBuildVega } from "./vegaCli.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const vegaProjectDir = path.join(rootDir, "services", "vega");
const vegaWebAssetsDir = path.join(vegaProjectDir, "assets", "www");

async function pathExists(filePath) {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function assertDistExists() {
  const hasBundle = await pathExists(path.join(distDir, "app.bundle.js"));
  const hasIndexHtml = await pathExists(path.join(distDir, "index.html"));
  if (!hasBundle || !hasIndexHtml) {
    throw new Error(`Build output not found at ${distDir}. Run "npm run build" first.`);
  }
}

async function assertVegaProjectReady() {
  if (!(await pathExists(path.join(vegaProjectDir, "manifest.toml")))) {
    throw new Error(
      `No Vega project found at ${vegaProjectDir}. Generate it first with the Vega SDK CLI ` +
        '("vega project generate --template vegaWebview --name NuvioVega ' +
        '--packageId space.nuvio.vega --outputDir services/vega"), wire up the WebView entry ' +
        "point, then re-run this script."
    );
  }
  if (!(await pathExists(path.join(vegaProjectDir, "node_modules")))) {
    throw new Error(`Run "npm install" inside ${vegaProjectDir} first.`);
  }
  if (!(await pathExists(path.join(vegaProjectDir, "package.json")))) {
    throw new Error(`Expected ${vegaProjectDir} to contain a package.json but none was found.`);
  }
}

async function injectPlatformFlag(indexHtmlPath) {
  const html = await readFile(indexHtmlPath, "utf8");
  const marker = '<script src="boot-guard.js"></script>';
  if (!html.includes(marker)) {
    throw new Error(`Expected marker "${marker}" not found in ${indexHtmlPath}.`);
  }
  const patched = html.replace(
    marker,
    `${marker}\n    <script>window.__NUVIO_PLATFORM__ = "vega";</script>`
  );
  await writeFile(indexHtmlPath, patched, "utf8");
}

async function stageWebAssets() {
  await rm(vegaWebAssetsDir, { recursive: true, force: true });
  await cp(distDir, vegaWebAssetsDir, { recursive: true });
  await injectPlatformFlag(path.join(vegaWebAssetsDir, "index.html"));
}

async function syncVegaVersion() {
  const { version } = await readAppMetadata();

  const manifestPath = path.join(vegaProjectDir, "manifest.toml");
  const manifest = await readFile(manifestPath, "utf8");
  const versionLinePattern = /^version = ".*"$/m;
  if (!versionLinePattern.test(manifest)) {
    throw new Error(`Could not find a "version = ..." line to update in ${manifestPath}.`);
  }
  const patchedManifest = manifest.replace(versionLinePattern, `version = "${version}"`);
  await writeFile(manifestPath, patchedManifest, "utf8");

  const packageJsonPath = path.join(vegaProjectDir, "package.json");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  packageJson.version = version;
  await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
}

async function packageVega() {
  await assertDistExists();
  await assertVegaProjectReady();

  console.log("staging Vega web assets...");
  await stageWebAssets();
  await syncVegaVersion();

  console.log("building Vega package (this invokes the Vega SDK's own build tool)...");
  runReactNativeBuildVega("Release", { cwd: vegaProjectDir });

  console.log(
    `\nVega packaging finished. Look for the .vpkg under ${path.join(vegaProjectDir, "build")}.`
  );
}

try {
  await packageVega();
} catch (error) {
  console.error("\nVega packaging failed:");
  console.error(error);
  process.exit(1);
}
