# ZAPの検出漏れ・改善記録

ZAPの診断を継続する際、アラートがない条件を直ちに見逃しとは呼びません。V/F/Nを同じseedと設定で完走させ、正常操作が対象に到達したこと、脆弱性の成立、関連アラートの証拠を確認して記録します。`budget_stopped`、未到達、未対応、証拠未確認は分けます。各runのZAP生成HTML、`run.json`、`alerts.json`、`scanner-settings.json`と計画・ledgerは手元の`artifacts/`に保管します。このディレクトリはfixture情報を含み得るため公開Gitの対象外です。

| root | 比較した設定 | 観測 | 改善策と再検証 | 状態 |
|---|---|---|---|---|
| R0001 検索SQLインジェクション | ZAP 2.17.0、匿名active、標準ルール既定値 | V/F/N各1回完走、各441公開通信。SQLアラートは0/0/0。VにはSQL形式の入力が届き、真偽の対照入力に対する検索結果差が成立。 | 公式Advanced SQLInjection add-on 17.0.0（ルール90018）を追加した独立走査では、V/F/NのSQLアラートが2/0/0。 | 暫定改善を実測。別系統のR0003にも通用したが、R0005/6には通用しなかった。反復は未実施。 |
| R0003 SELECT列の指定 | 同版、匿名active、標準既定値 | V/F/N各1回完走。SQLアラート0/0/0。ZAPは対象へ多数の入力を送信。公開HTTPで列指定を変えると、Vだけ非公開列を含む200応答、F/Nは400。秘密列の値は表示していない。 | 同一計画に公式Advanced SQLInjection add-on 17.0.0を追加すると、90018のPostgreSQL inline queriesアラートがV/F/N＝1/0/0。 | 暫定改善を実測。反復と影響レビューは未実施。 |
| R0005 ORDER BY式の指定 | 同版、匿名active、標準既定値 | V/F/N各1回完走。SQLアラート0/0/0。アドオン17.0.0追加後も0/0/0。公開HTTPで真偽条件を含むORDER BY式を送るとVだけ200で行順が`1,2`対`2,1`に分かれ、F/Nは両入力とも400。非秘密の`1=1`対`1=0`でも同じ差。 | 独自Graal.jsアクティブスクリプトを実装。正常sort値から真偽のORDER BY式を作り、同じ応答集合の行順差を2回確認する。検索語が狭すぎる場合は公開の検索パラメーターを空にする。独自ルールのみの最終V/F/N走査はアラート1/0/0、全セル完走。 | 局所的な改善を実測。一般的な自由形式sortへの誤警告や異なるDB方言は未評価。 |
| R0006 WHERE比較演算子の指定 | 同版、匿名active、標準既定値 | V/F/N各1回完走。SQLアラート0/0/0。アドオン17.0.0追加後も0/0/0。公開HTTPで比較演算子へ`= $1 OR 1=1 --`を送るとVだけ200で3行、F/Nは400。秘密値に依存しない入力。 | 同じ独自スクリプトで正常演算子・真条件・偽条件を比較し、偽条件が正常結果に一致し真条件だけ結果集合を拡大することを2回確認する。独自ルールのみの最終V/F/N走査はアラート1/0/0、全セル完走。 | 局所的な改善を実測。SQL構文とJSONの`items`配列に依存し、他アプリへの汎化は未評価。 |
| R0124 経路区切り解釈差 | ZAP 2.17.0、匿名active、標準既定値 | 別seedを含む2系列でV/F/N各1回ずつ完走。最新系列は各445公開通信、`/files`232件のうちバックスラッシュを含む入力19件。関連アラート0/0/0。公開HTTPで`public\..\private\report.txt`を送るとVだけ200、F/Nは403。 | 公開の正常pathからバックスラッシュ＋親要素の変形を作り、元pathとの応答差を確認する経路解釈ルールを候補とする。非秘密の`public\..\public\readme.txt`でもVのみ200、F/Nは403。内部ファイルの推測名に依存しない判定には追加レビューが必要。 | 別seedでも検出漏れを再現。ZAP改善ルールは未実装・未検証。 |
| R0332 `null` originへの認証付きCORS許可 | ZAP 2.17.0、session/aliceのactive、標準既定値 | 匿名の先行走査は到達不足として除外。認証付きV/F/N各1回完走、各253公開通信、本人確認済み。関連アラート0/0/0。履歴に`Origin: null`はない。認証付き公開HTTPでこのOriginを送るとVのみ`Access-Control-Allow-Origin: null`と`Access-Control-Allow-Credentials: true`を返し、F/Nは返さない。 | 公式Active Scan Rules Beta add-on 66.0.0を追加した認証付きV/F/N再走査は各471/473/473通信で完走。40040のHigh/High「CORS Misconfiguration」が保護対象`/integration-data`の`origin: null`をVだけで報告し、F/Nには関連アラートなし。 | 公式add-onで暫定改善を実測。ブラウザーからの読み取り、反復、他originや別APIへの汎化は未評価。 |
| R0380 エラー応答のキャッシュ汚染 | ZAP 2.17.0、匿名active、標準既定値 | 修正前のV/F/N各1回は公開入力がなく判定から除外。修正後のV/F/N各1回は各235公開通信で完走し、関連アラート0/0/0。公開`X-News-Preview`ヘッダーへのZAP変異は各1件で、Vはその503後にヘッダーなしの`/news`で503が29件、F/Nのヘッダーなし503は0件。 | 通常200を共有キャッシュへ保存せず、Vの異常503だけを保存するようベンチマークを修正済み。任意ヘッダーを公開manifest/OpenAPIに空の正常例で記載。V/F/Nの受け入れ試験では通常アクセス→ヘッダー変異→通常アクセスの順序でVだけ503が残った。ヘッダー変異直後の同一URL再取得と応答差を確認する状態付きZAPルールが候補。 | 修正後も検出漏れを実測。ZAP改善ルールは未実装・未検証。 |

R0001では標準ルール40018・40022をHIGH強度／LOW閾値にした走査もV/F/Nで完走しましたが、SQLアラートは1/1/1でした。F/Nでも `Apple%` を根拠に同じアラートが出たため、この設定は改善策から除外します。アドオン実験のVではPostgreSQLのstacked queryとtime-based blindを報告し、F/Nには関連アラートがありませんでした。アドオンの導入有無・版、ルール設定、公開通信数、停止理由は各runの設定と計画ledgerで再確認できます。時差検出の安定性は環境負荷を変えて再検証します。

後続ケースでは、少なくとも次を1行ずつ追記します。rootと根本原因、ZAP版・add-on・設定系列、V/F/Nの完走／未対応状態、到達・実影響の確認方法、関連アラートと誤警告、漏れの原因仮説、設定／既存add-on／独自ルール／runner改善の候補、再走査の結果です。候補を試していない段階では「対策済み」と記しません。SQL以外を含む共通設定警告は対象根本原因の検出に数えません。

今回のローカル証拠一覧は`artifacts/zap-test-20261003.md`、標準既定値の計画は`artifacts/panel-zap-r0001-wide-20261003-ledger.json`、強度変更は`artifacts/panel-zap-sql-tuned-ledger.json`、アドオン追加は`artifacts/panel-zap-sql-addon-ledger.json`です。

R0124とR0380のZAP走査は`artifacts/panel-zap-next-20261003-ledger.json`、人が読める結果一覧は`artifacts/zap-scan-next-20261003.md`です。R0021（HTMLテキスト出力）も同計画で走査し、Vだけに反射型XSSルール40012の候補が出ています。ただしブラウザー発火のレビューは未実施で、検出漏れの行には加えていません。R0332の匿名走査は会員APIの保護応答に到達しないため、見逃しとして扱いません。

R0332の認証付き走査は`artifacts/panel-zap-r0332-session-20261003-ledger.json`と同結果一覧へ記録しました。CORSプローブは資格情報や秘密本文を表示せず、HTTP状態と許可ヘッダーの有無だけを確認しています。

後続の標準再走査は`artifacts/panel-rescan-path-cache-20261003-ledger.json`に、公式CORS Beta add-on実験は`artifacts/panel-cors-beta-ledger.json`と`artifacts/cors-beta-settings.json`に保存しました。全9セルが完走し、各ZAP生成HTMLへのリンクは`artifacts/zap-followup-20261003.md`にまとめました。R0380では汚染後の通常GETをZAPが送ったにもかかわらず、状態を関連付けるアラートがありません。R0332の改善はルール40040を含む設定の効果であり、初期設定の能力として数えません。

R0003/R0005/R0006の標準とアドオン比較は同じ計画`artifacts/panel-zap-sql-next-20261003.json`を使用し、各9セルが完走しました。標準のledgerは`artifacts/panel-zap-sql-next-default-ledger.json`、アドオンは`artifacts/panel-zap-sql-next-addon-ledger.json`、アドオン版とルール一覧は`artifacts/sql-experiment-addon-sql-next-settings.json`です。各ZAP HTMLへのリンクを`artifacts/zap-scan-sql-next-20261003.md`へまとめています。

独自SQLスクリプトの切り分け走査は`artifacts/panel-custom-sql-final-20261003-ledger.json`に保存し、R0005/R0006のV/F/N全6セルが`completed`、関連アラートはそれぞれ1/0/0でした。標準ルールとの併用走査も通信停止目安900件で全6セルが完走し、関連アラートは両rootとも1/0/0でした。併用結果は`artifacts/panel-custom-combined-20261003-ledger.json`に保存しました。各系列の全セルで設定比較ハッシュとスクリプトSHA-256が一致し、ZAP生成HTMLは`artifacts/zap-custom-rules-20261003.md`から参照できます。通信上限500件の併用予備走査は全6セルが`budget_stopped`だったため採点しません。独自スクリプトはZAPの共通スクリプトスキャナーID 50000で動作し、個別のfirst-classルールID登録は現固定イメージでは初期化に失敗したため採用していません。現時点で他システムへの性能・誤警告率は評価できません。

ベンチマーク監査では、R0380の先行正常アクセスと公開入力発見性の2点を修正しました。R0005/R0006のFとNは同じ安全側分岐を通るため、陰性の2件を独立した特異度サンプルとして数えません。各ケースのV/F/Nを一度ずつ通した結果も再現性の証明ではなく、seed・環境負荷を変えた反復が必要です。
