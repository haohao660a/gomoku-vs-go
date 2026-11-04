/* 事件总线：按 order 顺序分发 mod 钩子，任一钩子返回 {error} 即中止 */
(function (root) {
  'use strict';
  const GVR = root.GVR || (root.GVR = {});

  function createBus() {
    const topics = Object.create(null);
    return {
      on(topic, fn, order) {
        const list = topics[topic] || (topics[topic] = []);
        list.push({ fn, order: Number(order) || 0 });
        list.sort((a, b) => a.order - b.order);
      },
      /** 顺序执行；返回 {ok, error?, results} */
      emit(topic, ctx) {
        const list = topics[topic] || [];
        const results = [];
        for (const item of list) {
          let r;
          try {
            r = item.fn(ctx);
          } catch (e) {
            return { ok: false, error: '规则执行异常：' + e.message, results };
          }
          results.push(r);
          if (r && r.error) return { ok: false, error: r.error, results };
        }
        return { ok: true, results };
      }
    };
  }

  GVR.createBus = createBus;
})(typeof window !== 'undefined' ? window : globalThis);
