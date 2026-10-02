# 追加18代表変種の実装履歴

この資料は先行42根本原因に18根本原因を追加した、60代表変種・V/F/Nの180条件の実装履歴です。その後の[追加50件](README-batch-01.md)を含め、当時のcatalogは110 rootの代表110変種・330条件です。FとNは安全な処理を共有します。別の入力例、修正版、安全な類似入力を新しい脆弱性として数えません。60版の成立確認は[acceptance-60.json](artifacts/acceptance-60.json)、当時の集計は[implementation-status-60.json](artifacts/implementation-status-60.json)に保持します。現行の成立確認時刻・チェック数・ブラウザー版は[implementation-status.json](implementation-status.json)と[acceptance.json](artifacts/acceptance.json)に保存します。

追加分もNode.js、PostgreSQL、Redis、Chromiumの共通環境を使います。通常入口、公開入力契約、V/F/N間の正常機能を揃え、管理者の成立確認では実際の実行・保存・返却・通信を検査します。全件は開発区分です。ZAP／Burpの検出能力、独自add-onの効果、本番投入の適否を判定した結果ではありません。

## 描画境界7件

| 根本原因／代表変種 | Vで比較する欠陥と実結果 | F/Nの修正境界・正常機能 |
|---|---|---|
| R0022／B0022 | 二重引用符付き属性の生値が属性境界を抜け、実クリックでevent handlerが動く。 | 属性値をescapeし、通常のラベル表示を維持する。二重引用符の代表実装に限定する。 |
| R0025／B0025 | 任意の属性名を受け付け、`onclick`が実ボタンに付く。 | 属性名を`title`、`aria-label`、`data-note`に限定する。属性値のescapeは全条件で共通。 |
| R0026／B0026 | リンクの`javascript:`値が実クリックで実行される。 | URLを解析し、同じorigin・workspaceのHTTP/HTTPS宛先を許可する。ローカルの通常リンクを維持する。 |
| R0027／B0027 | inline JavaScriptの一重引用符文字列を入力が抜け、実行される。 | 固定JavaScriptが別のJSON経路から表示値を取得し、`textContent`で描画する。HTMLのscript終端はVでも別途escapeする。 |
| R0029／B0029 | JSON文字列化した値でもHTMLの`</script>`が要素を終端し、後続scriptが動く。 | script内JSONのHTML境界文字をUnicode escapeする。JSONとして合法な引用符やコードに似た文字列はデータとして表示する。 |
| R0031／B0031 | style内のCSS値がHTMLの`</style>`を作り、後続scriptが動く。 | 色を6桁のhex値に限定し、通常の色変更を維持する。説明欄は全条件でescapeする。 |
| R0034／B0034 | inline SVGの生markupにevent handlerが入り、ブラウザーで動く。 | 固定viewBox、title、単一circleと数値・hex色の許可範囲からSVGを再構築する。 |

テストは通常UI、実ブラウザーの実行marker、F/Nの防止、文脈ごとの攻撃に似た合法入力、共通ナビゲーションを検査します。R0034の修正は固定のSVG機能だけに対応します。任意のSVGに対応するsanitizerではなく、複雑な要素、namespace、animation、URL参照などの安全性は評価していません。外部ホストへの通信は使用しません。

入力位置と修正境界が異なるため7根本原因に分けています。例えばJavaScript文字列境界とscript要素のHTML終端を別にし、後者を前者のテストで重複計上しません。

## 有限の資源制限5件

この5件は元設計の`comparison_track: bounded_stress`を保持します。通常DASTの集計へ混ぜず、操作回数・データ量と正常到達を固定した別のprotocolで比較してください。

| 根本原因／代表変種 | 実結果と業務上限 | 実験の範囲 |
|---|---|---|
| R0428／B0428 | 実PostgreSQL検索でページ件数の上限5を比較。Vは6行を返し、F/Nは範囲外を拒否する。 | データは12行。物理的なDB I/O飽和は再現しない。 |
| R0437／B0437 | 本人の通知を実Redis受信箱へ登録し、1時間に3件までの上限を比較する。 | 外部メールを送らない。宛先は全条件で本人の連絡先に制限する。 |
| R0438／B0438 | 実Redisのpending jobを3件までとし、4件目の登録と本人の取消後の再登録を比較する。 | job workerのCPU消費は再現しない。取消は登録応答の実IDを取り出す。固定の架空IDをOpenAPI正常入力にしない。 |
| R0439／B0439 | 実験用依存処理が先に失敗する条件で、retryを3回までにする修正と4回目の呼出しを比較する。 | ローカルの実呼出し記録と10/20msのbackoffを使う。外部サービスへ通信しない。 |
| R0440／B0440 | 実UTF-8ファイルへの追記で、業務上限1024 bytesと超過分の書込みを比較する。 | 共通の実験上限8192 bytesを設ける。ホストのディスクを枯渇させない。 |

通知は期間内件数、jobは未完了件数、retryは一操作内の呼出し数、ログは保存量、検索は返却行数を比較します。同じ「量が多い」という症状だけで統合すると修正境界が失われるため、別の根本原因を保持します。原子的なjob登録やログの直列化は全条件で共通とし、競合制御の欠陥を追加計上しません。小さな実験上限の存在を、業務上限の防止が成功した証拠にはしません。

## 返却・保存・収集経路6件

| 根本原因／代表変種 | Vでの実結果 | F/Nの修正境界・正常機能 |
|---|---|---|
| R0094／B0451 | 本人プロフィールの実DBモデルから内部属性まで返す。 | 公開DTOの許可属性を返す。本人認可は全条件で維持する。元設計の属性単位返却R0094に統合し、R0451を増設しない。 |
| R0452／B0452 | 実APIで使用できるBearer値を`localStorage`に保存する。 | 同じ有効期限・権限の値をページ内のclosureに保持する。Bearerによる正常API利用を維持する。 |
| R0453／B0453 | Service Workerが機密dashboard応答をCacheStorageへ保存し、ログアウト後や別会員の状態で再利用する。 | 公開応答だけをcacheする。HTTPの`no-store`は全条件で共通。通常HTTP cacheのR0477とは異なる保存主体を比較する。 |
| R0455／B0455 | 本人帳票を公開static領域へ生成し、無認証で実ファイルを取得できる。 | 生成先を私有領域にする。Expressの公開static経路と所有者確認付きprivate download経路は全条件で固定し、保存先だけを変える。 |
| R0457／B0457 | 正常ログインで使ったpasswordをブラウザーのJSONイベントに含め、別originの実験用収集サービスへ送る。 | イベントを公開username等の許可値に絞る。ログインと通常イベント送信は維持する。 |
| R0458／B0458 | 実APIのJSON解析失敗を受け、ブラウザーが実Authorization contextを添えて収集サービスへ送る。 | 例外の種類など最小限のmetadataを送る。正常Bearer APIと例外記録を維持する。 |

R0452は持続保存の範囲を比較します。同じoriginで任意JavaScriptが動く状況のすべてを防ぐ修正として扱いません。R0455は公開領域への保存を比較し、ディレクトリ一覧のR0464、他者文書の認可のR0271を追加計上しません。R0458はブラウザーから収集先へ送るcontextを比較し、サーバーの公開例外応答R0481とは出力経路が異なります。

R0457/R0458の収集先はDocker内のHTTPS 8444です。実ブラウザーのCORS POSTを使い、収集内容を管理者専用の状態から確認します。POSTとpreflight OPTIONSは公開通信計測に含まれます。全条件の公開契約は8443と8444を`requiredTargetOrigins`に指定します。現行のZAP runnerは8443だけを対象にするため、測定開始前に`unsupported_target_surface`で終了します。外部のanalyticsやerror収集サービスには接続しません。

## 製品測定との区別

成立確認は脆弱な実装が狙った結果を生じ、修正版と安全な類似例が防止することを確認します。製品測定では、その結果に対応するアラートとHTTP・ブラウザー証拠を別途レビューしてください。必要なブラウザー操作や状態を持つ操作が未実装の場合は未到達・未対応として残します。

現行開発版の未実行計画は[panel-catalog-current.json](artifacts/panel-catalog-current.json)の243 root・729セルです。[60版の180セル計画](artifacts/panel-catalog-60.json)、旧42ケース計画と6セルの順次実行記録は履歴として保存します。過去60版の[51セルのZAP実行](artifacts/zap-batch-smoke-index.json)と[9条件の設定比較](artifacts/zap-tuning-smoke-index.json)を新50件の検出実績へ引き継ぎません。Burp XMLの取込みはオフラインの形式・条件結合・証拠保存の検証です。合成XMLによる取込みが成功しても、Burp Suite Professionalを実行した結果やZAPとの性能比較にはなりません。Burp実測はライセンス調達後に行います。評価手順は[README-evaluation.md](README-evaluation.md)を参照してください。

現行開発版の33件追加と最終回帰の保留は[バッチ03](README-batch-03.md)に記載しています。

現行開発版の33件追加と最終回帰の保留は[バッチ03](README-batch-03.md)に記載しています。

現行開発版の33件追加と最終回帰の保留は[バッチ03](README-batch-03.md)に記載しています。
