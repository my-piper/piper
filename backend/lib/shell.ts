import { exec } from "child_process";

export function runInShell(command: string) {
  const shell = exec(command);
  // console.log('Exec command', command);
  let stdout = "",
    stderr = "";
  shell.stdout.on("data", (data) => (stdout = data));
  shell.stderr.on("data", (data) => (stderr = data));
  return new Promise((done, err) => {
    shell.addListener("close", (code) => {
      //console.log('Done', code, stdout, stderr);
      if (code === 0) {
        done(stdout);
      } else {
        err(new Error([stderr, "in command", command].join(" ")));
      }
    });
  });
}
