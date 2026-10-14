/* GitHub API 直传备份（git HTTPS 被阻断时的替代通道）
 * 用 gh CLI 走 api.github.com：blobs → tree → commit → ref，单提交推送整棵树
 * 用法：node dev-gh-upload.mjs [commit消息] */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const OWNER = 'cynthiazx1130';
const REPO = 'znotes';
const MSG = process.argv[2] || '备份更新';

const gh = (args, input) => {
  const r = execFileSync('gh', ['api', ...args], { input, maxBuffer: 64 * 1024 * 1024, encoding: 'utf8' });
  return JSON.parse(r);
};

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  .split('\0').filter(Boolean);
console.log('待上传文件数: ' + files.length);

const tree = [];
for (let i = 0; i < files.length; i++) {
  const f = files[i];
  const abs = path.join(process.cwd(), f);
  const bin = readFileSync(abs);
  const isBin = bin.includes(0);
  const blob = gh(['repos/' + OWNER + '/' + REPO + '/git/blobs', '--input', '-'],
    JSON.stringify({ content: bin.toString('base64'), encoding: 'base64' }));
  tree.push({ path: f.replace(/\\/g, '/'), mode: '100644', type: 'blob', sha: blob.sha });
  if ((i + 1) % 10 === 0 || i === files.length - 1) console.log('  已上传 ' + (i + 1) + '/' + files.length);
}

const newTree = gh(['repos/' + OWNER + '/' + REPO + '/git/trees', '--input', '-'],
  JSON.stringify({ tree }));
console.log('tree: ' + newTree.sha);

let ref = null;
try { ref = gh(['repos/' + OWNER + '/' + REPO + '/git/ref/heads/master']); } catch (e) { /* 分支不存在 */ }
const parents = ref ? [ref.object.sha] : []; // 快进链：新提交必须以远端当前 HEAD 为父
const commit = gh(['repos/' + OWNER + '/' + REPO + '/git/commits', '--input', '-'],
  JSON.stringify({ message: MSG, tree: newTree.sha, parents }));
console.log('commit: ' + commit.sha);
if (ref) {
  gh(['repos/' + OWNER + '/' + REPO + '/git/refs/heads/master', '-X', 'PATCH', '--input', '-'],
    JSON.stringify({ sha: commit.sha }));
} else {
  gh(['repos/' + OWNER + '/' + REPO + '/git/refs', '--input', '-'],
    JSON.stringify({ ref: 'refs/heads/master', sha: commit.sha }));
}
console.log('完成：master -> ' + commit.sha);
