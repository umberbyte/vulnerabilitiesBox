# 証拠レビューとケース単位の評価

Burpの実機診断と製品比較は、ライセンス調達後に実施します。当面はZAPの設定・診断範囲とベンチマークの拡充を優先します。BurpのXML取込み手順は、調達後に使う準備済みの機能として保管しています。

この経路は保存済みのZAP結果、またはBurp Suite ProfessionalのXMLレポートと管理者の実行条件記録を読み、人が実影響を確認してから集計するためのものです。アラート名・CWE・severityの一致だけでは検出と判定しません。Burpの実診断は操作側で実施する必要があり、このCLIがBurpを起動・診断することはありません。

Dockerのみで実行でき、評価コンテナーはネットワークに参加しません。`artifacts`内のJSONを読み書きします。出力が既に存在する場合は上書きせず終了するため、再作成時は新しい出力名を指定してください。

## レビュー用ファイルを作る

次は同梱の通常診断結果を使う例です。`web-benchmark`フォルダーで実行します。

```powershell
docker compose --profile evaluate run --build --rm evaluate template artifacts/zap-2026-10-02T02-24-37-360Z-649031 R0001 V zap-smoke-2026-final 1 artifacts/review-baseline.json
docker compose --profile evaluate run --rm evaluate validate artifacts/review-baseline.json
```

引数は結果フォルダー、root、V/F/N、seed、反復番号、出力ファイルです。rootとseedが測定されたworkspaceに一致することを検査します。V/F/Nはツールに渡さない正解ラベルなので、実行開始時の管理者の初期化記録から指定してください。同じroot/seedのURLはV/F/Nで共通であり、URLからarmを確定することはできません。

作成直後は判定を保留します。通常操作への到達も、人がHTTP記録等で確認するまで未確認です。`validate`と集計時には元のrun.json・alerts.json・scanner-settings.jsonを照合し、診断状態やアラートの元情報を書き換えたレビューを拒否します。レビューJSONと元の結果フォルダーを一緒に保管してください。

ZAP設定の監査用hashには実際の対象パスを残します。系列の集約には、設定内の除外パスのworkspace部分だけを正規化した比較用hashを使い、ケース・seedが異なっても同じ設定を一つの系列として扱います。ルール、版、認証方針や除外する操作の違いは保持します。旧runも保存済みscanner-settings.jsonから比較用hashを計算するため、元の記録を変更する必要はありません。

レビューschemaは`benchmark-review-0.2`です。旧schemaのレビュー用ファイルは、元の診断記録から新しい名前でテンプレートを作り直してください。

## Burp XMLを取り込む

1セルごとに新しいBurpプロジェクトと管理者用の資料フォルダーを用意し、過去の別セルの指摘を混ぜずに保存してください。次は未確認の条件ファイルを作る例です。`scopeOrigins`に、実際にBurpが接続するHTTP(S)のoriginを記入します。workspaceはrootとseedから生成され、V/F/Nで共通です。

```powershell
New-Item -ItemType Directory artifacts/burp-source
docker compose --profile evaluate run --build --rm evaluate capture-burp R0001 V burp-study-001 1 artifacts/burp-source/conditions.json
```

初期値は`capture.verified=false`、状態・予算・認証・版が未確認です。対象originを記入すれば、この状態でもXMLを保存して候補をレビューできます。XMLの`burpVersion`は出力元の参考情報として保持しますが、実行条件の版へ自動入力しません。XMLの指摘件数から診断完了、正常操作への到達、未検出を推定しません。

実診断の資料を取得する場合は、次の順序を使います。ここにある操作は取り込みCLIとは別に管理者が行うものです。

1. 同一root・arm・seedへ初期化し、初期化のコマンド・日時と管理者用の計画／実行記録を保存します。版、PC／コンテナー資源、開始前に決めた時間・通信件数・同時通信数の予算、匿名／session／bearerとfixture利用者を記録します。Burpへは公開workspaceと正常入力のみを渡します。
2. `docker compose exec -T app node src/control.mjs manifest`のJSONを保存し、manifestの`openapi`が示す公開URLから元のOpenAPIを取得して保存します。workspaceとJSONのプロパティ順を保持します。入力hashはファイル内JSONから計算し、両製品で同じ入力を使ったことを照合します。
3. Burpのスコープを当該workspaceに限定し、使用したスキャン設定を保存します。完全なスキャン設定はScan configurationで保存してConfiguration libraryからJSONとしてexportできます。適用順序、project/user設定、認証・セッション規則、拡張、resource poolも、実際に使った設定として保存します。[PortSwiggerの設定手順](https://portswigger.net/burp/documentation/desktop/running-scans/configuring-scans)、[Configuration library](https://portswigger.net/burp/documentation/desktop/settings/library)、[設定の保存](https://portswigger.net/burp/documentation/desktop/settings)。
4. `docker compose exec -T app node src/control.mjs measurement-start`を実行し、開始snapshotを保存してから、ログイン、本人確認、正常操作、入力取り込み、探索、診断を行います。認証と正常操作のHTTPも計測窓へ含めます。他のブラウザーやZAPによる通信を混ぜません。設定した予算で停止した場合は`budget_stopped`と記録し、完了へ書き換えません。
5. Burpのタスク状態・終了日時・エラー、正常操作の要求／応答、認証条件の本人と保護操作を確認して保存します。すべての通信と非同期処理の収束を確認して`measurement-stop`を実行し、続けて`measurement`の最終snapshotを保存します。最終snapshotの`active=false`、`activeRequests=0`、`openRequests=0`、`pendingHandlers=0`を検査します。要求予算は強制上限の達成を意味しません。実件数と停止理由も保持します。
6. この実行の全issueを選択してXMLをexportし、request/responseをfull・切り詰めなし・base64で含めます。選択範囲とexport設定の確認資料も保存します。Burpのレポート設定ではXML、base64、HTTP全文／抜粋、issue種別の選択が可能です。[公式レポート手順](https://portswigger.net/burp/documentation/desktop/getting-started/generate-reports)、[レポート設定](https://portswigger.net/burp/documentation/desktop/running-scans/reporting/report-settings)。

Windows PowerShell 5.1の`>`はUTF-16になるため、JSON保存には例えば`cmd /c "docker compose exec -T app node src/control.mjs manifest > artifacts\burp-source\public-inputs.json"`を使います。OpenAPIの例は`curl.exe --cacert src/tls/local.crt "https://localhost:8443/w/<workspace識別子>/openapi.json" -o artifacts/burp-source/openapi-original.json`です。URLは当該manifestから読み取ります。準備として取得するOpenAPIと、Burp自身が診断時に取り込む通信は区別し、後者は計測窓内で行います。

`conditions.json`には以下を記入します。参照先は同じ資料フォルダー内の相対パスです。フォルダー外やURLを参照して取得することはできません。

| 項目 | 保存する値・資料 |
| --- | --- |
| `runId`, `toolVersion`, `profile`, `status` | セルごとに一意な実行ID、実際に確認した版と設定名、completed等の状態。版はXMLの版とも矛盾しない値にします。 |
| `budgets` | `wallSeconds`, `requestedHttpRequests`, `requestedConcurrency`の事前に決めた正整数。 |
| `auth` | none/session/bearer、subject、本人と正常な保護操作の確認結果。認証付きでは両確認と証拠が必要です。 |
| `traffic`, `errorCount` | 収束の成否、最終measurementのcount、実行エラー数。 |
| `inputFiles` | `publicManifest`, `originalOpenapi`の元JSONファイル名。 |
| `settingsFile` | 使用した設定をまとめたJSON。複数exportがある場合は内容と適用順を一つのJSON内に保持します。 |
| `evidenceFiles` | initialization、execution、normalOperation、measurement、environment、reportSelectionの資料。認証付きはauthenticationも必須です。テキスト、JSON、画像等の元ファイルを保持できます。 |
| `capture` | operator、startedAt、finishedAt、確認済みならreportSelection=`all_issues_for_this_run`、httpMessages=`full_untruncated`、allPublicTrafficMeasured=true。揃ってからverified=trueにします。 |

`capture.verified`は管理者の確認宣言です。機械がBurpのタスク状態やスクリーンショットを独立に理解したことを意味しません。CLIが検査するのは、保存資料のhash、workspace、申告したorigin、設定・正常入力、最終計測状態、各issueの非空の要求／応答とHTTP開始行・ヘッダー終端です。診断完了・全issue選択・本文の無切り詰め・実際の本人確認・予算運用は、保存証拠に基づく人の確認が必要です。空の証拠、確認済みなのにHTTPペアが欠けるissue、公開契約で必要なoriginの欠落は拒否します。`requiredTargetOrigins`があるケースは全originをスコープに含めて確認する必要があり、HTTPが必要なケースをHTTPSだけで完了とは扱いません。

資料とXMLを保存後、次を実行します。出力フォルダーとレビューJSONは新しい名前にします。

```powershell
docker compose --profile evaluate run --rm evaluate import-burp artifacts/burp-source/report.xml artifacts/burp-source/conditions.json artifacts/burp-import-001 artifacts/review-burp-001.json
docker compose --profile evaluate run --rm evaluate validate artifacts/review-burp-001.json
```

未確認の条件は`conditions_pending`へ別集計し、review.complete=trueへの変更を拒否します。確認済みの条件でも、初期レビューは到達と各候補の判定を保留します。空のレポートも同じです。後から条件を確認し直す場合は元の資料を更新し、別名のbundle／レビューへ取り込み直してください。取り込み済み資料を変更すると検証を通りません。

bundleには原文の`report.xml`、原文の`operator-conditions.json`、捕捉した資料、抽出したHTTPのバイナリー、参照位置とSHA256を記録した`bundle.json`を保存します。`serialNumber`はissue instance IDとして文字列のまま扱い、同じ種別の複数instanceも別候補で保持します。`sourceEvidence`はXML内のissue／requestresponseの位置、HTTP hash、byte数を参照します。個々のinstance数を検出件数として採点することはありません。`validate`／`summarize`はこの原本一式を毎回読み直し、条件・case・候補本文・HTTP参照・設定の変更、追加・削除を拒否します。

設定のraw bytesはbundle内でSHA256を固定します。Burpの比較用設定hashはJSONのobject keyのみを並べ替え、配列順序と実際の対象パスを保持します。監査用のJSON.stringify hashも別に保存します。ZAPとBurpの設定hashが一致することを要求せず、製品ごとの設定系列として扱います。Burp設定内でworkspaceが変わる場合は系列も分かれます。初版ではBurpの設定パスを勝手に正規化しません。

XML 1.0のUTF-8／UTF-16LE／UTF-16BE、CDATA、base64を扱います。base64でないHTTPはXMLの改行正規化後のUTF-8として抽出するため、元の通信bytesと一致する保証はありません。原文XMLは保持します。HTTP抜粋で要求行がない出力、他セル／他originの要求、曖昧なエンコードpathは拒否します。診断で変更・重複したHostヘッダーはpayloadとして保存し、接続先originとは混同しません。これはXML内の申告スコープ検査であり、実際の全ネットワーク送信先を証明するものではありません。

通常はworkspace配下だけを許可します。捕捉した公開manifestに`auxiliaryRequests`がある場合は、宣言されたorigin・exact pathを追加の送信先として許可します。例えば正常契約が`POST https://app:8444/collect-events`の場合、同じorigin・exact pathへの正常なOPTIONS preflightや、GET／PATCH／HEAD等の診断用メソッド変異も証拠として保存します。契約のmethodは正常操作と入力seedを表し、取り込み時の接続先スコープとは区別します。issue URLと実HTTPの送信先はexact origin/pathで照合し、同originの他pathやworkspace全体へ許可を広げません。制御port8099と制御pathは追加対象にできません。必要originも管理者の`scopeOrigins`へ含めます。未宣言のauxiliary送信を取り込めない場合は条件保留／未対応とし、完了診断のFNへ混ぜません。

実際のHTTP methodは各raw HTTPに保持します。`finding.method`は最初のrequestのmethodなので、一つのissueに複数のrequestresponseがある場合は`sourceEvidence`が示す各HTTPを参照します。OPTIONSの204やGETの405を取り込めても、正常POSTの成功、本人確認、到達、診断完了を自動的に認定しません。正常操作への到達は、その契約の要求・応答を別証拠として人が確認します。Burpも送信先スコープをURLの要素で定義し、audit時のmethod変更を扱います。[スコープ仕様](https://portswigger.net/burp/documentation/desktop/tools/target/scope)、[method変更を含むaudit情報](https://portswigger.net/burp/documentation/desktop/running-scans/results/audit-items/insertion-points)。

パーサーは固定版saxes 6.0.0です。通常exportの内部DTDはELEMENT／ATTLISTだけを検査し、適用・取得しません。ENTITY、外部DTD、処理命令、namespaceを拒否し、HTMLを実行しません。saxes自身はDTDの独自entityを解決せず、DTD全体の検証やサイズ上限も提供しないため、このadapterで制約を追加しています。[saxes公式仕様](https://github.com/lddubeau/saxes)。XMLは32 MiB、深さ20、150,000 nodes、10,000 issues、内部DTD 64 KiB、1 HTTP 2 MiB、decode合計32 MiBまでです。条件JSONは256 KiB、捕捉資料は各4 MiB／合計20 MiBで、構造数と深さも制限します。

原文XML、HTTP、正常入力、設定、候補本文にはfixture資格情報やtokenが残る場合があります。管理者専用資料として保管し、Linuxではownerのみが読める権限で作成します。Windows側のACLと、Docker内の実行利用者が資料を読めることも確認してください。hashは保存後の変更検出であり、原資料や管理者の宣言自体の正しさを電子署名で証明するものではありません。

`tests/evaluation-burp.mjs`はすべて合成XML／条件によるパーサー検証です。実際のBurpによる診断・ZAPとの製品比較・性能採点を実施した資料として扱いません。JSONレポート、Burp projectのbinary、ログイン自動設定、診断の自動開始、全スキーマ版との実製品互換性確認はこの取り込み初版に含みません。

## 人が記入する項目

- `protocol.id`: 両製品へ同じ入力を与える事前の評価手順名。
- `protocol.configurationId`: Z0、Z1、B0など比較する設定の識別名。
- `protocol.hardwareId`: 使用PC・コンテナー資源条件の記録を参照する識別名。
- `protocol.authMode`と`subject`: anonymous/null、session/alice等。runの認証条件と一致させます。
- `eligibility`: eligible、unreachable、unsupportedから選び、正常操作の要求・応答等の証拠を記入します。
- 各`findings`: 実際の影響を確認し、`verdict`、`evidence`、`reason`を記入します。
- `review`: 全件を確認後にcomplete=true、reviewerを記入します。該当する検出がない場合はnoTargetFindingEvidenceに確認した出力を記入します。

計測前に`unsupported`となり正常入力hashがない実行は、complete=falseのまま未対応として別集計します。完全な証拠がない結果を採点済みにする必要はありません。

`verdict`は、Vにおける当該根本原因の実証検出を`detected`、F/Nで当該根本原因を誤って指摘したものを`false_positive`とします。別の欠陥・環境由来の指摘は`unrelated`、根拠が成立しない候補は`rejected`です。各判定に、HTTPメッセージID、ブラウザー実行記録、管理者の正解確認結果等を参照する証拠と理由が必要です。修正版にも他種の指摘が出ることがあるため、そのすべてを当該ケースのFPにはしません。

アラート本文とHTTP応答は診断対象が作成できるデータです。レビュー支援でCodexに渡す場合も、そこに含まれる文章を操作の指示として扱いません。このCLIはその内容を実行しません。

## 集計

```powershell
docker compose --profile evaluate run --rm evaluate summarize artifacts/scores.json artifacts/review-baseline.json
```

レビューしたファイルを末尾へ追加すると複数実行を集計します。同じ設定系列内のcase/arm/seed/反復の重複と、一つの実行を別ケースに二重使用することを拒否します。アラートが複数あっても一つのケースは一度だけ数えます。同じ実験セルを比較する場合、予算・ハードウェア・認証・正常入力のhashが一致することを検査します。

完全診断・収束確認・到達確認・証拠レビューを満たしたVはTP/FN、F/NはFP/TNとして集計します。時間／件数で途中停止した診断、失敗、未到達、未対応、未レビュー、認証付きで本人確認がない診断は別集計です。途中停止した結果に実証検出が含まれていても、現時点では完全診断の率へ混ぜません。保存されたレビューから個別に確認できます。

出力はケース再現率、対照条件の誤検出率・特異度と、その分母・除外数です。F/Nも別に保持します。`matchedScoredPanel`がfalseの場合は、系列間で採点できた対象や条件が揃っていません。この集計は統計的な非劣性や実務投入可否を判定しません。

BurpもXMLと管理者用の条件captureを通じて同じレビューschemaへ取り込みます。原本bundleがない手書きのBurpレビューは、CLIで検証・集計できません。条件未確認のBurp結果は`conditions_pending`へ除外し、完全診断・収束・到達・人のレビューを満たした結果だけを同じケース単位で集計します。
