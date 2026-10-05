# 管理者用の実験計画

実装済みcatalogから診断条件の組み合わせを作り、未実行のセルをJSONへ保存します。計画生成CLIはネットワーク通信を行いません。別のworkerを明示的に起動すると、その計画だけを既存ZAP runnerで逐次実行し、別ファイルのledgerへ実行状態を記録します。結果の採点は行いません。

計画にはroot、代表variant、V/F/N、seed、反復番号、想定workspace、診断・認証・通信予算の条件、`status: "not_run"`、空の`run`参照を保存します。これは管理者専用の記録です。実際に診断する段階では、操作側が対象を初期化し、scannerへは公開の入力契約と対象URLを渡します。

## 生成例

`web-benchmark`フォルダーからDockerで次を実行します。ホストへのNode.js導入は必要ありません。`panel`コンテナーはネットワークに参加せず、`artifacts`へ管理者用JSONを書き込みます。

```powershell
docker compose --profile panel run --build --rm panel list
docker compose --profile panel run --rm panel generate artifacts/panel-small.json --roots R0001,R0271 --seeds panel-a --arms V,F,N --profiles baseline --auth anonymous --wall-seconds 30 --requests 100
```

この例は2 root × 3 arm × 1 seed × 1反復の6セルを作ります。認証付きの計画は、たとえば次のように生成します。

```powershell
docker compose --profile panel run --rm panel generate artifacts/panel-session.json --roots R0271 --seeds panel-a,panel-b --replicates 2 --profiles baseline,active --auth session --user alice --wall-seconds 30 --requests 100
```

こちらは1 root × 3 arm × 2 seed × 2反復 × 2 profileの24セルです。Node.jsがある開発環境では、同じ引数を `node src/runner/panel-cli.mjs` に渡して実行できます。

低強度policyも同じ初期条件で比較する小さな計画は次のように生成します。

```powershell
docker compose --profile panel run --build --rm panel generate artifacts/panel-low-pilot.json --roots R0001 --seeds low-pilot --arms V,F,N --profiles baseline,active,active-low --auth anonymous --wall-seconds 30 --requests 100
```

これは9セルの未実行計画です。計画生成は診断を開始しません。`active-low`は`active`と同じ正常入力・探索・認証を使い、全インストール済みアクティブルールを専用policyで有効化し、LOW強度・MEDIUM閾値を設定します。既定policyに無効ルールがある場合は有効ルール集合も異なるので、結果だけで強度差の比較とみなさず、実snapshotを照合してください。全caseに共通設定を使い、rootやV/F/N、過去の結果でルールを選びません。詳細は[README-zap.md](README-zap.md)に記載しています。

`--roots all`は実装済みcatalogの全rootを明示的に選択します。設計資料だけにある未実装rootは対象へ含めません。catalogへ実装が追加された後に新しい計画を生成すると、その一覧へ追従します。既存の計画は生成時のcatalogと条件を保持します。

代表変種以外を診断する場合は、追加変種用の計画を生成できます。次の例はB0004のV/F/Nを標準active設定で計画します。`--profile`は`baseline`または`active`、`--wall-seconds`と`--requests`は停止目安です。生成後の実行は同じ`run-panel.cmd`を使います。

```powershell
docker compose --profile panel run --build --rm --entrypoint node panel src/runner/generate-variant-panel.mjs artifacts/panel-b0004.json --variants B0004 --profile active --seed example-b0004 --wall-seconds 60 --requests 700
.\run-panel.cmd artifacts/panel-b0004.json artifacts/panel-b0004-ledger.json
```

追加変種計画も保存資料の監査で計画・台帳・runを照合します。workerは`failed`や`incomplete_drain`では安全確認のためその計画を停止するため、複数変種で失敗後も続ける場合は変種ごとに計画と台帳を分け、次の実行前に公開通信と非同期処理の収束を確認してください。

公開リポジトリに管理者用計画は含めません。現在のソースは337根本原因・500変種です。代表337変種だけを各V/F/Nで計画すると1011セルです。手元のcatalogから新しいファイル名を指定して計画を生成してください。計画生成は成立確認や診断を実行しません。

```powershell
docker compose --profile panel run --rm panel generate artifacts/panel-current-local.json --roots all --seeds catalog-current --arms V,F,N --profiles baseline --auth anonymous --wall-seconds 30 --requests 100
```

[実装範囲と検証状態](README-coverage.md)に、現在のソース件数と成立確認済み範囲を記載しています。過去の計画、ledger、runは公開リポジトリに含めていません。手元で生成した計画がすべて`not_run`でも、全catalogの完走や製品の検出能力を示しません。

OTP、招待、委任、承認、支払などの複数段階の操作では、計画にsession条件を入れただけで保護対象へ到達したとは扱いません。現行runnerは通常POSTの順次実行、応答値の引継ぎ、複数主体の切替えを汎用には実装していません。Burpによる実測と比較はライセンス調達後に行います。

## 引数と保存

| 引数 | 内容・省略時 |
|---|---|
| `generate OUTPUT.json` | 出力ファイルは必須。既存ファイルは上書きせず終了。 |
| `--roots` | 必須。実装済みrootのCSV、または単独の`all`。 |
| `--seeds` | 必須。seedのCSV。各seedは最大256文字。 |
| `--arms` | V/F/NのCSV。省略時は`V,F,N`。 |
| `--replicates` | 1〜3。省略時は1。 |
| `--profiles` | baseline/active/active-lowのCSV。省略時はbaseline。 |
| `--auth` | anonymous/session/bearerのCSV。省略時はanonymous。 |
| `--user` | alice/bob/carol/approver/adminの一つ。省略時はalice。匿名セルのsubjectはnull。 |
| `--wall-seconds` | 10〜1200。省略時は30。 |
| `--requests` | 10〜3000。省略時は100。 |
| `--max-cells` | 1〜10000。省略時は10000。上限を低くするために使う。 |

rootとseedを省略して全件を生成する入口はありません。CSVの空要素・重複、同じflagの重複、未実装root、未知のflag、範囲外の数値を拒否します。セル数は生成前に検査します。出力の親フォルダーは必要に応じて作成します。

順序はroot、arm（V/F/N）、seed、反復番号、profile（baseline/active/active-low）、認証方式（anonymous/session/bearer）です。rootとseedは文字列順に揃え、入力の並べ方が違ってもセルの順序とIDは安定します。同じroot＋seedのworkspaceはarm・反復・設定条件にかかわらず同じです。V/F/NはURLから判別できません。従来のbaseline/activeだけの保存済み計画は条件・順序・IDを維持し、active-lowセルが自動追加されることはありません。

計画上の時間・通信数は、現在のrunnerと同じ停止目安です。厳密な件数・同時処理の上限を設定する機能ではありません。add-onや実際の設定snapshot、到達、停止理由、未対応、採点は実行・レビュー段階で記録します。認証付き条件を計画へ入れたことだけで、そのケースの認証契約への対応や正常保護操作への到達が確認されたことにはなりません。

匿名と認証付き、baseline・active・active-lowは条件が異なる系列として扱います。反復には同じseedへ戻す初期化が必要です。同じComposeプロジェクトでは対象を一つずつ実行する前提です。

## 明示した計画の実行

起動済みアプリが最新の成立検証を通過していることを確認し、まず少数セルの計画を使ってください。wrapperはアプリを起動しますが、アプリimageのbuildは行いません。controllerだけをbuildし、計画のJSONを変更せず、新しいledgerファイルへ結果を書きます。引数を省略して全件を実行する入口はありません。

```powershell
docker compose --profile panel run --build --rm panel generate artifacts/panel-pilot.json --roots R0001 --seeds panel-pilot --arms V,F,N --profiles baseline --auth anonymous --wall-seconds 30 --requests 100
.\run-panel.cmd artifacts/panel-pilot.json artifacts/panel-pilot-ledger.json
```

Linux/macOSでは同じ2引数を `sh run-panel.sh` へ渡します。計画とledgerは両方とも`artifacts`内のパスで指定します。存在しない計画、既存ledger、計画と同じledger名、`artifacts`外のパスを拒否します。Windowsの`.cmd`はPowerShellのスクリプト実行ポリシーの変更を必要としません。

SQL構文位置・経路区切りなどの独自ZAPルールを加える場合は第3引数に`custom`を指定します。独自ルール単体の切り分けは`custom-only`を指定し、全セルが`active`の計画を使います。R0380の順序依存の照合はコントローラーがZAPの履歴を後処理し、出所を明記したアラートとしてZAPへ追加します。導入したスクリプトの名前・SHA-256・有効スキャナーは各セルの`scanner-settings.json`へ、後処理の根拠は`history-findings.json`へ保存します。詳しくは[ZAP手順](README-zap.md)を参照してください。

workerは計画全体を生成時のcatalogと条件から再構築し、ID、セル順、root/variant、V/F/N、seed、反復、workspace、profile、認証、予算、未実行statusを照合します。壊れた条件や重複セル、実装から削除・変更されたroot/variantは、対象を初期化する前に拒否します。catalogに新しいrootが増えた場合でも、古い計画のセルを追加して実行することはありません。

計画とledgerは0600の非公開ファイルとして保存します。Dockerの`panel`と`scan-controller`は管理者側のUID 0に揃えています。Node.jsをホストや別のLinux UIDで動かして計画を生成する場合も、controllerがそのファイルを読める所有者・権限を用意してください。`cap_drop: ALL`のcontrollerはroot UIDでも他のUIDが所有する0600ファイルを読み越せません。EACCESを避けるためにファイルを一律に公開するのではなく、管理者側の所有者を合わせてください。

各セルは次の順で処理します。

1. private計測がinactiveで、`activeRequests`・`openRequests`・`pendingHandlers`がすべて0であることを確認。
2. 前のZAP scanがFINISHED、passive `recordsToScan=0`と`currentTasks`空が250ms間隔で3回続き、認証用HttpSender scriptが残っていないことを確認し、private APIでroot・arm・seedを初期化。
3. ZAPをprotect modeにして、引数を省略した`core.newSession`で新しいunnamed sessionを作り、proxy/ascan/spider除外をclearし、保存HTTP履歴が0であることを確認。
4. 子プロセスの`scan-zap.mjs`へprofile・認証方式・fixture user・時間・件数の条件を渡して実行。
5. 新しく作られた一つのrunディレクトリを検出し、workspace、公開manifest hash、profile、認証方式・本人、予算、run状態、設定snapshotの監査hash・比較hashを照合。
6. 完了時の計測ID・workspace・件数・peakとartifactを照合し、inactiveかつ全pending=0を再確認してから次のセルへ進む。

`newSession`のname/overwriteはoptionalで、nameを省略するとunnamed sessionが作られます。[ZAP公式API client](https://github.com/zaproxy/zap-api-python/blob/main/src/zapv2/core.py)、[ZAP 2.17.0 CoreAPI実装](https://github.com/zaproxy/zaproxy/blob/v2.17.0/zap/src/main/java/org/zaproxy/zap/extension/api/CoreAPI.java#L656)に基づきます。sessionの作り直しはglobalのadd-on版・scan policy・全script設定を初期化する操作ではありません。そのため除外を明示clearし、認証scriptの残留も検査します。除外APIは[ActiveScanAPI](https://github.com/zaproxy/zaproxy/blob/v2.17.0/zap/src/main/java/org/zaproxy/zap/extension/ascan/ActiveScanAPI.java)と[SpiderAPI](https://github.com/zaproxy/zap-extensions/blob/main/addOns/spider/src/main/java/org/zaproxy/addon/spider/SpiderAPI.java)を確認しています。

`active-low`の専用policyはrunnerが毎セル新規作成し、選択policyのsnapshot保存・API状態と公開handlerの収束確認後に削除します。既定policyと元のpolicy一覧が変わっていないことも検査し、`run.activeScanPolicy.cleanup`へ証拠を記録します。同名policyの残留、snapshot保存や削除・復元確認の失敗は`failed`として後続resetを止めます。`newSession`だけで低強度policyが消えたとみなす処理はありません。

operator/controllerだけが計画のroot・V/F/N・seedと制御鍵を保持します。ZAPには公開入力、対象workspace、scanner API鍵、fixture認証のための情報だけを渡します。Docker socketをcontainerへ渡しません。子stdout、HTTP本文、scannerのalert本文を次の実行指示やartifactの保存先として解釈しません。子stdout/stderrは抑制し、失敗内容はledgerに固定のerror codeで記録します。調査には保存された`run.json`とraw成果物を使用します。

## ledgerと停止条件

ledgerには計画パス・ファイルSHA256・planId、各セルの管理者専用条件、開始・終了、phase、runパスとファイルSHA256、正常認証の到達、計測結果、設定hash、error codeを保存します。`completed`はrunnerが終了したこと、`budget_stopped`は時間・件数の停止目安に達したこと、`unsupported`はその認証契約等に現在対応していないことを表します。alert数を診断の正解件数とみなす処理はありません。

`budget_stopped`や`unsupported`でもinactiveかつ全pending=0が確認できれば、状態を区別して次のセルへ進めます。`failed`、`incomplete_drain`、途中クラッシュ、応答・handlerの未収束、artifact不一致、計測競合、残留scriptではledgerを`halted`にし、後続のresetを行いません。未実行セルは`not_run`のまま残ります。正常認証が完了したrunは本人確認とpost-scan確認を要求します。sessionで対応する正常保護GETがないケースの`protectedOperationVerified: false`はそのまま保存し、到達済みと解釈しません。

子プロセスが計画のwall予算＋180秒（startup・drain・reportの猶予）を超えた場合は強制終了し、その計画を停止します。厳密な診断件数・総同時処理数の上限を強制する仕組みではありません。wrapper終了時はZAP containerを削除します。

passiveの終了待ちは最大10秒で打ち切ります。queueをclearしたりruleを無効にして見かけの0を作る処理は行いません。複数回のidle確認はAPIで観測する条件であり、未開始taskや外部操作までを原子的に排除するbarrierではありません。[Passive Scanner API](https://www.zaproxy.org/docs/desktop/addons/passive-scanner/api/)、固定imageに入っている[pscan 0.6.0のAPI実装](https://github.com/zaproxy/zap-extensions/blob/pscan-v0.6.0/addOns/pscan/src/main/java/org/zaproxy/addon/pscan/PassiveScanApi.java)、[公式controller実装](https://github.com/zaproxy/zap-extensions/blob/pscan-v0.6.0/addOns/pscan/src/main/java/org/zaproxy/addon/pscan/internal/scanner/PassiveScanController.java)を参照しています。global ruleの有効状態が実行中に変わる可能性もあるため、各runの設定snapshotを照合せずに同一条件として採点しないでください。

公開入力が追加のHTTP originなどを `requiredTargetOrigins` で要求するセルは、HTTPSだけを対象とする現在のrunnerでは計測前の `unsupported_target_surface` として記録します。R0461のHTTP開始点、R0457/R0458の8444収集経路が該当します。case IDで選別せず、正常入力の公開契約を使って未対応を判断します。

元設計の比較系列は`implementation-status.json`の各代表変種の`comparison_track`に保存します。資源制限5件は`bounded_stress`です。通常のHTTP診断、実ブラウザーでの描画・localStorage・Service Worker、状態を持つAPI操作、有限の資源制限は、必要な操作と証拠が異なります。対応するprotocolを評価時に分けてください。job取消のように正常応答のIDを後続要求へ引き継ぐ操作を、固定OpenAPI入力だけで再現したとは扱いません。対象の範囲は[カバレッジ資料](README-coverage.md)を参照してください。

初版はrestart/resumeに対応しません。途中のledgerやraw成果物を保管し、計測と未完了handlerの状態を確認した上で別の新しいledgerを指定してください。既存ledgerの上書きや自動再実行は行いません。計画全セルをdispatchできた場合のledger `completed`には、個々の`budget_stopped`や`unsupported`も含まれるため、セル別statusを確認してください。

実行中は同じComposeプロジェクトを占有し、ブラウザー、`verify`、単発scan wrapper、別workerによる公開通信やresetを止めてください。起動前のprivate meter確認と各セルの検査はありますが、外部操作を原子的に排除する共通leaseはありません。同じroot＋seedのV/F/Nは同じURLを使うため、競合によるarmの変更をURLから検出することはできません。raw HTTPにはfixture credentials/session/JWTが含まれ得ます。管理者専用の計画・ledgerとともに取扱いを管理してください。

MCPからの駆動、Burp比較、add-onの追加、性能採点、手動証拠レビューはこのworkerの実装範囲に含まれません。評価手順は[README-evaluation.md](README-evaluation.md)、単発runnerと認証の制限は[README-zap.md](README-zap.md)を参照してください。

V/F/Nをローカルで高速確認する場合の明示的な4スレッド条件と実測結果は[README-zap-speed.md](README-zap-speed.md)を参照してください。
