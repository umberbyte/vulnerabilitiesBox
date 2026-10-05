# 通信・ブラウザー境界5変種の成立確認とZAP再計測

2026-10-05に、B0339（ローカルAPI CORS）、B0342（WebSocket frame主体信頼）、B0345（設計名はWS token URL漏えい）、B0349（SSE tenant漏れ）、B0454（ブラウザ履歴秘密）をローカルDockerで確認した。[B0342・B0345・B0349の個別V/F/N記録](artifacts/extended-regression-saved-stream-five-source-20261005.json)は同時に確認したB0348・B0350を含む5変種・15セル合格、[B0339・B0454の個別記録](artifacts/extended-regression-saved-stream-replacements-source-20261005.json)は2変種・6セル合格である。両記録の対象アプリ実行ソースSHA-256は`7c752884e402a6ee0f1eca50c0719dbcde2ec70618ea1cb106b33bf0484595a7`で、下記ZAP系列の対象前後と制御側にも一致した。依存サービスの実際のイメージID・状態までの一致は証明できていない。

最初はB0342・B0345・B0348・B0349・B0350の5変種で計画生成を試みたが、`Invalid variant selection`で終了した。B0348・B0350は代表変種であり、追加変種用計画生成器が参照する`variantCases`に存在しないことを確認した。この系列ではB0339・B0454を追加で個別確認し、計測対象を入れ替えた。B0348・B0350は後続で[代表変種用計画による計測](README-representative-browser-events-source-zap.md)を完了した。

[計画](artifacts/panel-stream-five-source-20261005.json)と[台帳](artifacts/panel-stream-five-source-20261005-ledger.json)に15セルを保存した。seedは`batch5-docker-smoke`、profileは`active`、上限は90秒・700リクエスト、同時2リクエスト。B0339は匿名、他4変種はaliceのセッション認証である。15セルすべて`completed`、実行エラー0、通信drain済み、ZAP API履歴の保存完了を確認した。

| 変種 | V/F/Nの実リクエスト数 | V/F/Nの保存済みZAP通信件数 | V/F/Nの全アラート数 | 対象経路の保存通信 | ZAP HTML |
| --- | --- | --- | --- | --- | --- |
| B0339 | 261/261/261 | 202/202/202 | 35/34/34 | `/v5-transport/local`各21件 | [V](artifacts/zap-2026-10-05T05-46-28-389Z-c0aa82/zap-report.html)・[F](artifacts/zap-2026-10-05T05-46-45-437Z-a37cb5/zap-report.html)・[N](artifacts/zap-2026-10-05T05-47-04-029Z-d8167a/zap-report.html) |
| B0342 | 231/231/231 | 158/158/158 | 14/14/14 | `/v5-socket`各29件 | [V](artifacts/zap-2026-10-05T05-47-22-638Z-5d3cb2/zap-report.html)・[F](artifacts/zap-2026-10-05T05-47-39-818Z-0032ef/zap-report.html)・[N](artifacts/zap-2026-10-05T05-47-57-531Z-6b4fe1/zap-report.html) |
| B0345 | 482/482/482 | 425/425/425 | 34/34/34 | `/v4-account`関連各303件 | [V](artifacts/zap-2026-10-05T05-48-13-232Z-217940/zap-report.html)・[F](artifacts/zap-2026-10-05T05-48-42-600Z-31640a/zap-report.html)・[N](artifacts/zap-2026-10-05T05-49-11-968Z-735f4e/zap-report.html) |
| B0349 | 492/492/492 | 421/421/421 | 16/16/16 | `/v5-transport/events`各259件 | [V](artifacts/zap-2026-10-05T05-49-41-221Z-e2d83e/zap-report.html)・[F](artifacts/zap-2026-10-05T05-50-14-523Z-59980d/zap-report.html)・[N](artifacts/zap-2026-10-05T05-50-47-872Z-bf6a09/zap-report.html) |
| B0454 | 456/456/456 | 385/385/385 | 17/17/17 | `/v4-account`関連各263件 | [V](artifacts/zap-2026-10-05T05-51-21-241Z-aec4ca/zap-report.html)・[F](artifacts/zap-2026-10-05T05-51-49-070Z-93cfae/zap-report.html)・[N](artifacts/zap-2026-10-05T05-52-16-845Z-e868f1/zap-report.html) |

B0339のVにはplugin `10098`（Cross-Domain Misconfiguration、Medium）が[対象URLのアラート](artifacts/zap-2026-10-05T05-46-28-389Z-c0aa82/alerts.json)として1件あり、F/Nにはない。[保存通信](artifacts/zap-2026-10-05T05-46-28-389Z-c0aa82/messages-first-500.json)では、秘密フィールドを含む成功応答18件にVのみ`Access-Control-Allow-Origin: *`が付いており、F/Nでは0件だった。一方、保存要求に`Origin`ヘッダーはなく、別originのブラウザーから実際に読めるかはこの系列で実証していない。したがって**Vだけの有力な検出候補**として保持し、真陽性や検出率にはまだ算入しない。

B0342ではHTTP履歴にWebSocketの`Upgrade`要求がなく、frame主体の判定はできない。B0349ではSSE経路には到達したが、`tenant=B`要求はなかった。B0454では秘密を含むlanding URLへの要求やブラウザー履歴の観測はなかった。B0345の設計名はWS token URL漏えいだが、[実装](src/cases/batch4-auth-state.mjs)と[個別確認手順](tests/docker-smoke-selected.mjs)は`/v4-account/reset`のURLをHTTPアクセスログへ保存する挙動を扱う。WebSocket固有の欠陥としての充足性は別途レビューが必要で、この系列をその検出証拠には数えない。B0342・B0345・B0349・B0454のアラート数はV/F/Nで同じであり、5変種すべてHighは0件だった。完走、到達、アラート総数を検出成功に換算しない。

オフラインの[証拠対応表](artifacts/evidence-linkage.md)では、実行ソース対応済みが65から70変種、個別成立記録はあるがソース対応未確認が193から188変種となった。依存環境の完全対応済みは0のままである。
