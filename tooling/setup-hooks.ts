import { existsSync } from "node:fs";
import husky from "husky";

// A generated project may live inside another repository; never change its parent's hooks.
if (
  process.env.CI ||
  process.env.HUSKY === "0" ||
  process.env.NODE_ENV === "production"
) {
  // Development hooks are intentionally skipped in these environments.
} else if (!existsSync(".git")) {
  console.log(
    "未检测到当前项目的 .git。需要提交钩子时运行 git init，然后 npm run prepare。",
  );
} else {
  const error = husky();
  if (error) throw new Error(error);
}
