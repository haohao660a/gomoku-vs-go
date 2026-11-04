/* 内置规则模板：模板就是一份配置文本（规则 + 参数）
   扩展方式：在 next/templates/ 下新增一个 .js 文件，内容形如
     GVR.registerTemplate({ key: 'my', name: '我的规则', desc: '说明', text: 'board = 15\nmod ...' });
   然后在 next/index.html 里加一行 script 标签引用 templates/my.js（放在 main.js 之前），
   重新运行 npm run build:single 即会自动内联进单文件产物。 */
(function (root) {
  'use strict';
  const GVR = root.GVR || (root.GVR = {});

  const TEMPLATES = [
    {
      key: 'gomoku',
      name: '普通五子棋',
      desc: '双方连珠 5 子获胜，无围棋、无能量。',
      text: [
        '# 普通五子棋：黑方先行，任一方连成 5 子即胜',
        'board = 15',
        '',
        'mod chain on owner=双方 n=5 dirs=横竖斜 mode=至少',
        'mod go off',
        'mod win on owner=双方 captureTarget=0',
        'mod energy off',
        'mod gain off',
        'mod combo off',
        'mod move off'
      ].join('\n')
    },
    {
      key: 'go30',
      name: '双方围棋 · 提 30 子胜',
      desc: '双方按围棋气与提子规则对局，任一方累计提子 30 颗获胜。',
      text: [
        '# 双方围棋：气/提子规则；提满 30 子获胜',
        'board = 15',
        '',
        'mod go on owner=双方 suicide=禁入',
        'mod win on owner=双方 captureTarget=30',
        'mod chain off',
        'mod energy off',
        'mod gain off',
        'mod combo off',
        'mod move off'
      ].join('\n')
    },
    {
      key: 'mix',
      name: '五子棋对围棋',
      desc: '黑方连珠 5 子获胜；白方按围棋提子，提满 10 子获胜。',
      text: [
        '# 混合对局：黑方连珠 5 子胜；白方围棋提满 10 子胜',
        'board = 15',
        '',
        'mod chain on owner=黑 n=5 dirs=横竖斜 mode=至少',
        'mod go on owner=双方 suicide=禁入',
        'mod win on owner=双方 captureTarget=10',
        'mod energy off',
        'mod gain off',
        'mod combo off',
        'mod move off'
      ].join('\n')
    },
    {
      key: 'mix-energy',
      name: '五子棋对围棋 v1',
      desc: '白方有 10 格能量：黑方每落一子 +1；消耗 5 点可连打，本回合额外落子 1 颗（每回合 1 次）。胜负同上一模板。',
      text: [
        '# 五子棋对围棋 v1：白方能量上限 10；黑方落子给白方 +1 能量；5 能量换一次连打',
        'board = 15',
        '',
        'mod chain on owner=黑 n=5 dirs=横竖斜 mode=至少',
        'mod go on owner=双方 suicide=禁入',
        'mod energy on owner=白 init=0 min=0 max=10',
        'mod gain on owner=白 amount=1',
        'mod combo on owner=白 cost=5 extra=1 perTurn=1',
        'mod move off owner=白 cost=3',
        'mod win on owner=双方 captureTarget=10'
      ].join('\n')
    }
  ];

  function registerTemplate(tpl) {
    if (!tpl || !tpl.key || !tpl.text) throw new Error('模板需要 key 与 text');
    const idx = TEMPLATES.findIndex((t) => t.key === tpl.key);
    if (idx >= 0) TEMPLATES[idx] = tpl;
    else TEMPLATES.push(tpl);
    return tpl;
  }

  function getTemplate(key) {
    return TEMPLATES.find((t) => t.key === key) || TEMPLATES[0];
  }

  GVR.TEMPLATES = TEMPLATES;
  GVR.registerTemplate = registerTemplate;
  GVR.getTemplate = getTemplate;
})(typeof window !== 'undefined' ? window : globalThis);
