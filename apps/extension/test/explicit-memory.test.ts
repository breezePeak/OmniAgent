import assert from 'node:assert/strict';
import test from 'node:test';
import { extractExplicitMemoryContent, inferExplicitMemoryType } from '../src/explicit-memory.js';

test('extracts inline facts from common explicit memory commands', () => {
  assert.equal(extractExplicitMemoryContent('请记住：我叫张三'), '我叫张三');
  assert.equal(extractExplicitMemoryContent('记住我喜欢简洁回复'), '我喜欢简洁回复');
  assert.equal(extractExplicitMemoryContent('把项目安装命令 pnpm install 保存到长期记忆'), '项目安装命令 pnpm install');
  assert.equal(extractExplicitMemoryContent('请把以下内容保存到长期记忆：服务端口是 8080'), '服务端口是 8080');
});

test('leaves referential commands for conversation or file resolution', () => {
  assert.equal(extractExplicitMemoryContent('请记住这个文档'), null);
  assert.equal(extractExplicitMemoryContent('帮我记忆这些考题'), null);
  assert.equal(extractExplicitMemoryContent('记住上面的内容'), null);
  assert.equal(extractExplicitMemoryContent('请把以上内容保存到长期记忆'), null);
  assert.equal(extractExplicitMemoryContent('把当前对话保存到长期记忆'), null);
  assert.equal(extractExplicitMemoryContent('我让你保存到记忆里，我会跨对话的'), null);
  assert.equal(extractExplicitMemoryContent('全部保存到长期记忆'), null);
});

test('classifies directly sourced memory content for the side-panel layers', () => {
  assert.equal(inferExplicitMemoryType('我叫张三'), 'profile');
  assert.equal(inferExplicitMemoryType('我喜欢简洁回复'), 'preference');
  assert.equal(inferExplicitMemoryType('当前项目使用 pnpm'), 'project');
  assert.equal(inferExplicitMemoryType('部署步骤：首先构建，然后启动'), 'procedure');
  assert.equal(inferExplicitMemoryType('服务端口是 8080'), 'knowledge');
});
