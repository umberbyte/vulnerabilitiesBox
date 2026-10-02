# バッチ03: 33件実装・最終回帰待ち

> このページは再開前の243件時点の履歴です。現行状況は[再開状況](README-batch-03-resumed.md)を参照してください。

今回の100件要求のうち33根本原因の代表33変種を実装しました。現在のソースcatalogは243代表ケースで、前段210件を維持しています。追加33件の最終成立確認と全体回帰は、ユーザーの「回帰テストはあとで纏めて」という指示に従い保留しました。

**今回の100件要求は未完了です。** 残る67件の担当処理はサービス側のcybersecurity制限で停止しました。ユーザーがDaybreakを有効にしたとの通知後、同じ割当を再開しましたが、両担当で同じ制限が再発しました。Docker操作の自動承認レビューによる拒否ではありません。未検証の途中ファイルは作業領域のdraftへ保存し、配布・catalogに含めません。

検証済みの最新リリースは[210件版ZIP](../web-benchmark-210.zip)です。新しい[243件開発版ZIP](../web-benchmark-development.zip)は最終検証待ちです。243件すべてが合格したとは扱いません。元設計337根本原因／500変種のうち、ソース未実装は94根本原因／257変種です。

## 実装した33代表ケース

| 根本原因 | 代表変種 | 元設計 | 実装と境界 |
|---|---|---|---|
| R0143 | B0143 | 拡張子末尾差 | 元filenameの最初のextensionを検査し最後のextensionでMIME配信するV。F/Nは最終extensionとJPEG decodeを照合。実SVGのbrowser実行とJPEG正常表示を比較。 |
| R0145 | B0145 | 画像EXIF漏えい | 本物のJPEG APP1 Exif/TIFF ImageDescriptionを公開するVとAPP1を除去するF/N。独立したExif解析とJPEG decodeでmetadata/画素を確認。 |
| R0148 | B0148 | CSV式注入 | 実PG値をCSVとしてexportし、先頭=のcellをVだけ式cellとして保持。F/Nはtext escape。CSV parserでcell境界を確認するauditでありExcelの式実行は主張しない。 |
| R0411 | B0411 | coupon消費競合 | couponのPG check/useを実2並列で重ねる。F/Nはrow lock。私的同期点はHTTP評価面に公開しない。 |
| R0412 | B0412 | 残高check-use競合 | 実balanceを80ずつ引く2並列で残高check/useを比較。F/Nはrow lock。 |
| R0413 | B0413 | 在庫last item競合 | 最後の1個を実PGで2並列注文。F/Nはrow lock。 |
| R0414 | B0414 | 一意登録競合 | 実同じemail予約を2並列INSERT。F/NはDB unique indexを使用。 |
| R0415 | B0415 | reset消費競合 | 実password更新を伴う単回回復tokenの2並列消費。F/Nはtoken row lock。 |
| R0416 | B0416 | idempotency競合 | 実課金前後のidempotency record作成順。F/Nはunique keyをtransactionで先に確保。 |
| R0417 | B0417 | upload検査公開競合 | 実fsへ一時保存してから内容検査。Vは検査中に公開場所へ置き、F/Nは成功後に公開。 |
| R0418 | B0418 | FSリンクTOCTOU | 実symlinkをrealpath検査後に変更してopenするVと、検査済みfile handleを保持するF/N。対象は固定の実験用2ファイルだけ。 |
| R0419 | B0419 | 権限check-update競合 | 実PG権限generationを検査した後で失効し更新するV。F/Nは更新条件にgenerationを再検査。 |
| R0420 | B0420 | session主体中間状態 | Redisの実sessionへ資格情報検証前にusernameを書くV。F/Nは成功後に変更。並行する本人GETで中間主体を観察。R0237のglobal共有主体とは別。 |
| R0421 | B0421 | ReDoS | 固定の実正規表現を隔離子processで評価。Vの曖昧反復とF/Nの線形文法を比較。入力27文字・子process350msの共通guard、長さ16の業務予算。host DoSは行わない。 |
| R0422 | B0422 | XML実体増幅 | 狭い内部ENTITY宣言文法のresolverとSaxesで実textを展開。業務64/共通512文字、外部実体禁止。一般DTD/XXEの実装ではない。 |
| R0423 | B0423 | ZIP展開増幅 | 本物の単一deflate ZIPをzlibで展開。業務64/共通8192bytes。F/Nは宣言長とdecoder maxOutputLengthの両方を検査。 |
| R0424 | B0424 | JSON深さ | 引用・escapeを扱うJSON深さprecheckと本物のJSON.parse。業務3/共通12階層。Vだけ深いtreeを構築利用。 |
| R0425 | B0425 | GraphQL深さ | 本物のGraphQL parse/validate/executeと階層resolver。業務3/共通12階層。 |
| R0426 | B0426 | GraphQL別名増幅 | 本物のGraphQL alias実行とPG SELECT回数。業務4/共通16項目。重複fieldの正常mergeを維持。 |
| R0427 | B0427 | GraphQL batch試行 | 本物のGraphQL batchで各credential resolverを実照合。Vはrequest単位、F/Nは個別照合単位のRedis budget。 |
| R0429 | B0429 | 未索引検索 | 固定1024行のPG EXPLAIN ANALYZEでseq scanとindexed prefix検索を比較。実removed/returned行をaudit。CPU/実機負荷の推定とは混ぜない。 |
| R0430 | B0430 | 画像寸法増幅 | 本物のPNG decodeとRGBA buffer。業務4096/共通65536pixels。F/Nはdecode前にdimension検査。 |
| R0431 | B0431 | multipart field増幅 | 本物のBusboy multipart streaming parser。業務8/共通32fields、field256bytes。F/Nはparser.fields limit。 |
| R0432 | B0432 | upload無期限stream | 本物のHTTP chunked streamを受信しfsへ保存。業務40/共通250ms、12×16bytesまで。F/Nはdeadlineで破棄。 |
| R0433 | B0433 | 長いheader | 本物のNode HTTP parserのmaxHeaderSizeを512/4096bytesで比較。固定内部proxyへ正常descriptionをheaderとして渡す。 |
| R0434 | B0434 | 低速body | 本物のTCP/HTTP分割bodyとsocket idle deadline40/200ms。共通250msで全socketを終了。 |
| R0435 | B0435 | WebSocket frame無制限 | 本物のws frame parser maxPayload64/4096bytesと実frame。閉じたloopback backendへの中継でありpublic WSS discoveryの測定ではない。 |
| R0436 | B0436 | SSE接続無制限 | 本物のSSE応答と同主体の同時接続。業務2/共通4、最大600ms。接続終了を確認してreset。 |
| R0471 | B0471 | nosniff欠落誤配信 | 同origin classic scriptにtext/plainを配信し実Chromiumのnosniffを比較。正常なtext読取と正規JSは維持。 |
| R0483 | B0483 | 認証障害fail open | 本物のloopback認可serviceがsocketを切断した時、Vだけ権限判定を許可へ倒す。一般会員・正常denyは共通。 |
| R0485 | B0485 | エラーでCSRF免除 | 本物のloopback token検証serviceの通信失敗をVだけvalidと扱う。F/Nはfail closed。 |
| R0489 | B0489 | 機密ログ全量記録 | 実資格情報照合を行う専用signinのappendFile log。Vだけpasswordを全量保存、F/Nはredaction。audit track。 |
| R0490 | B0490 | worker例外伝播 | 固定の隔離子process内で本物のWorker例外を発生。Vだけworker hostへ未処理errorが伝播し後続正常jobが失われる。web app本体を停止するケースではない。 |

## 今回までの検証記録

追加33件の初回検証は[99条件中96合格・3失敗](artifacts/acceptance-batch03-first-pass.json)でした。3失敗はR0416の検証側で初期残高を2000と誤って想定したためです。実fixtureの3000を使う検証値へ修正しましたが、その修正後の最終再実行は保留です。記録を成功結果へ書き換えません。

243件を対象とした全体回帰はユーザーの指示で停止しました。[停止記録](artifacts/regression-243-interrupted.json)と[途中log](artifacts/verify-243.log)を保存し、完了結果として扱いません。その実行冒頭の[回帰テスト174件](artifacts/unit-tests-243-preliminary.tap)は通っていますが、全729条件の成立確認を代替しません。

[現行管理者計画](artifacts/panel-catalog-current.json)は243 root×V/F/Nの729セル、すべて `not_run` です。630条件の合格記録は[210件版の履歴](artifacts/acceptance-210.json)です。V/F/Nは成立確認条件であり、729件の異なる脆弱性を意味しません。

## 評価と実装の条件

競合10件は実HTTP要求を並行させ、実PG/Redis/fsの状態を照合します。私的同期と権限失効・symlink切替は鍵付きの非公開 `/case-action` に限定します。将来の診断では、自然な競合の成功頻度と私的同期による成立確認を分けます。添付の内容検査は有限の禁止literal policyで、antivirus製品は再現しません。

業務予算と共通の外側上限を分けます。regex子process350ms、worker host800ms、socket250ms、SSE600ms、ZIP出力8192bytes、PNG65536pixelsなどに制限します。SQL検索は固定1024行の実EXPLAIN ANALYZEの走査行数を比較し、F/Nは小さなfixtureでもindex accessを使う条件を明示します。CPU性能・大規模負荷耐性の一般的な推定は行いません。

R0431はJSON fieldsから実multipartへ中継してBusboyで解析します。一部のHTTP/TCP/WebSocketと障害serviceは閉じたloopbackで実通信を行いますが、診断入口はJSON中継です。公開native protocolの到達・診断能力を直接評価する実装ではありません。GraphQLは一つのoperationと直接fieldだけの代表文法で、fragment/directive/複数operationを対象外とします。

CSVは式prefix、JPEGはExif、logは秘密保存を監査観測します。Excelの式実行やWeb app本体のworker例外による停止は主張しません。正常JPEGは独立TIFF readerとJPEG decodeでmetadataと画素を確認します。

ZAP/Burpの検出率は未測定です。Burp製品実行はライセンス調達後へ延期します。

## 初回時点で停止した67件

engine系33件: R0061, R0062, R0063, R0064, R0065, R0066, R0067, R0068, R0071, R0072, R0074, R0076, R0084, R0086, R0089, R0105, R0107, R0108, R0111, R0113, R0117, R0118, R0162, R0163, R0164, R0167, R0168, R0169, R0170, R0171, R0172, R0178, R0179。

protocol・認証境界系34件: R0095, R0208, R0212, R0234, R0237, R0240, R0242, R0245, R0250, R0260, R0265, R0266, R0267, R0269, R0270, R0341, R0350, R0351, R0356, R0357, R0358, R0362, R0363, R0364, R0365, R0366, R0367, R0463, R0466, R0474, R0475, R0476, R0479, R0480。

## あとで行う回帰

実装を追加し終えてから、[README](README.md)の `verify.cmd`（Windows）または `sh verify.sh`（macOS/Linux）でcatalog全体をまとめて検証します。今回の作業では再実行しません。最終成功後に結果・source hash・計画を結合し、検証済みリリースを作成します。
