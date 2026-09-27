import { spawnSync } from "node:child_process";

export function runReactNativeBuildVega(buildType, { cwd }) {
  const result = spawnSync("npx", ["react-native", "build-vega", "--build-type", buildType], {
    cwd,
    stdio: "inherit"
  });
  if (result.error) {
    throw new Error(
      `Failed to run react-native build-vega --build-type ${buildType}: ${result.error.message}`
    );
  }
  if (result.status !== 0) {
    throw new Error(
      `react-native build-vega --build-type ${buildType} exited with code ${result.status}. ` +
        'Make sure the Vega SDK environment is loaded in this shell (e.g. "source ~/vega/env") ' +
        "before running this script."
    );
  }
}
