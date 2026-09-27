import { spawnSync } from "node:child_process";

export function runReactNativeBuildKepler(buildType, { cwd }) {
  const result = spawnSync("npx", ["react-native", "build-kepler", "--build-type", buildType], {
    cwd,
    stdio: "inherit"
  });
  if (result.error) {
    throw new Error(
      `Failed to run react-native build-kepler --build-type ${buildType}: ${result.error.message}`
    );
  }
  if (result.status !== 0) {
    throw new Error(
      `react-native build-kepler --build-type ${buildType} exited with code ${result.status}`
    );
  }
}
