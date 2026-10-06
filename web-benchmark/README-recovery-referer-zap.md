# B0208 回復ページの Referer と ZAP V/F/N 走査（2026-10-06）

既存の B0208 は、本人の単回利用回復トークンを使ってページを開く。そのページの補助 origin `https://app:8444/b3-pixel` への画像リクエストで、V では Referer にトークンが含まれ、F/N では含まれない。正常なパスワード変更フォームも V/F/N で成功する。修正側の `Referrer-Policy` は `same-origin` とし、別 origin への Referer を抑えながら同一 origin のフォーム送信を保つ。修正後の個別成立確認 `artifacts/acceptance-saved-R0208-browser-referer-20261006.json` は3/3セル・39/39チェックに合格した。

計画 `artifacts/panel-recovery-referer-fixed-20261006.json` と台帳 `artifacts/panel-recovery-referer-fixed-20261006-ledger.json` は、共通 seed `recovery-referer-fixed-20261006`、匿名 active、各セル240秒・HTTP 8,000件・明示的8スレッドを記録する。V/F/N は3/3セル `completed`。実行ソース照合は各セル `matched`、終了時 drain は成立、run 内の error は0件で、要求数は順に1,728・1,529・1,529件だった。ZAP HTML、一次 origin の生 HTTP、画像については Chromium の要求・応答ヘッダーを `browser-recovery-pixel-http.json` として各 run に保存した。

ZAP の `core/view/messages` には補助 SVG 画像が3セルとも残らなかった。画像の受信と Referer の有無は、ZAP alert や画像の ZAP 履歴ではなく、保存したブラウザー HTTP 原本による観察である。補助 origin は画像の観測だけを許し、spider・active scan から除外した。[ZAP の公式資料](https://www.zaproxy.org/docs/desktop/addons/image-location-and-privacy-scanner/)にも画像履歴の扱いが説明されているが、この run で ZAP が画像を解析したとは主張しない。

失敗の経緯は原本を残した。`panel-recovery-referer-20261006-ledger.json` は画像が ZAP 履歴にないため V で停止。画像処理設定を有効にした試行では、最初の台帳がソース不一致で走査前停止し、再構築後の台帳も画像履歴は0件だった。`panel-recovery-referer-browser-20261006-ledger.json` は正規 POST のクエリを待機条件が許さず V で停止。`panel-recovery-referer-browser-retry-20261006-ledger.json` は V 完了後、F の正規フォーム POST が `Origin: null` で403になり停止した。このため修正側を `same-origin` に改め、ブラウザーによる正規操作も個別成立確認に加えてから最終系列を実行した。失敗した系列を成功系列に混在させない。

走査完了とブラウザーの挙動は、ZAP が脆弱性を検出したことや誤検出しなかったことを意味しない。集計原本はローカル `artifacts/index.html`、`artifacts/evidence-linkage.json` にある。`artifacts/` は公開 Git に含めない。
