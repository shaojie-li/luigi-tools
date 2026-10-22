import { spawn } from "node:child_process";
import { stripVTControlCharacters } from "node:util";
import { AppError } from "./errors.js";
import type { PackageManager } from "./schema.js";

export async function installDependencies(
  root: string,
  packageManager: Exclude<PackageManager, "none">,
): Promise<void> {
  process.stderr.write(`正在使用 ${packageManager} 安装依赖：${root}\n`);
  let output = "";
  const forwardOutput = (chunk: string) => {
    process.stderr.write(chunk);
    // Keep diagnostics bounded while still streaming the complete log to stderr.
    output = (output + chunk).slice(-16_384);
  };
  try {
    await new Promise<void>((resolve, reject) => {
      // Commands and arguments are fixed; Windows package-manager launchers need a shell.
      const child = spawn(packageManager, ["install"], {
        cwd: root,
        shell: process.platform === "win32",
        stdio: ["ignore", "pipe", "pipe"],
      });
      child.stdout.setEncoding("utf8").on("data", forwardOutput);
      child.stderr.setEncoding("utf8").on("data", forwardOutput);
      child.once("error", reject);
      child.once("close", (code, signal) => {
        if (code === 0) resolve();
        else
          reject(
            new Error(signal ? `进程被信号 ${signal} 终止` : `退出码 ${code}`),
          );
      });
    });
  } catch (error) {
    const diagnostics = stripVTControlCharacters(output).trim();
    throw new AppError(
      "DEPENDENCY_INSTALL_FAILED",
      `${packageManager} install 失败：${error instanceof Error ? error.message : String(error)}。${diagnostics ? `\n安装输出（末尾）：\n${diagnostics}\n` : "\n"}项目文件已保留在 ${root}；确认 ${packageManager} 可用并解决安装错误后，进入该目录执行 ${packageManager} install 重试。`,
    );
  }
}
