/* 平台介面：AI 和下載檔案都經過這裡，畫面程式不直接碰任何 API。
   - 在 Claude 裡開啟（線上原型）：用 Claude 的 sample（AI）和 downloads（下載）。
   - 一般瀏覽器（雙擊 index.html、GitHub Pages）：可以下載；AI 尚未接後端，顯示為不可用。
   之後接自己的後端時，只要在這裡加一種 kind，實作 json() 和 text()，錯誤代碼沿用下面的 ERROR_CODES。 */
(function (LD) {
  'use strict';

  /**
   * 錯誤一律用 { code, message?, text? } 拒絕，code 沿用 Claude sample 的代碼：
   * cancelled、not_granted、sampling_disabled、images_unavailable、image_rejected、rate_limited、
   * session_expired、refused、invalid_json、prompt_too_large、empty_completion、upstream_error、not_available
   */
  const P = {
    kind: 'browser',            // 'claude' | 'browser'
    ai: { text: false, images: false, maxImages: 1 },
    _sample: null,
    _downloads: null
  };

  P.init = async function init() {
    const c = globalThis.claude;
    if (c && typeof c.use === 'function') {
      P.kind = 'claude';
      try {
        const s = await c.use('sample');
        if (s) {
          P._sample = s;
          P.ai.text = true;
          const lim = await s.limits().catch(() => null);
          P.ai.images = !!(lim && lim.images);
          P.ai.maxImages = (lim && lim.images && lim.images.maxCount) || 1;
        }
      } catch (e) { /* 沒有 AI 也能用 */ }
      try { P._downloads = await c.use('downloads'); } catch (e) { P._downloads = null; }
    }
    return P;
  };

  /** 要求 AI 回覆一個 JSON 值。opts：{ images?: Blob[], signal? } */
  P.json = (prompt, opts) => P._sample ? P._sample.json(prompt, opts) : Promise.reject({ code: 'not_available' });

  /** 要求 AI 回覆文字，可串流。opts：{ signal?, onText?({text}), cache? } → { text, truncated } */
  P.text = (prompt, opts) => P._sample ? P._sample(prompt, opts) : Promise.reject({ code: 'not_available' });

  P.canSave = () => P.kind === 'claude' ? !!P._downloads : true;

  /** 讓使用者存檔。Claude 裡會跳出確認視窗；一般瀏覽器直接下載。
      asciiName：一般瀏覽器用的英數檔名（部分瀏覽器遇到中文檔名會改成 "download"） */
  P.saveFile = async function saveFile(filename, data, asciiName, mime) {
    if (P.kind === 'claude') {
      if (!P._downloads) throw { code: 'unavailable' };
      return P._downloads.save({ filename, data });
    }
    const blob = new Blob([data], { type: mime || 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = /[^\x20-\x7E]/.test(filename) && asciiName ? asciiName : filename; a.hidden = true;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return { status: 'saved' };
  };

  LD.platform = P;
})(globalThis.LD = globalThis.LD || {});
