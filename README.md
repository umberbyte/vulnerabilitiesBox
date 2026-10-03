# vulnerabilitiesBox

Web脆弱性診断ツールを比較するための、Docker上の**意図的に脆弱な**ローカル実験環境です。設計500変種・337根本原因をソースに実装しています。統合Docker検証で代表210根本原因のV/F/N計630条件、追加56変種のV/F/N計168条件、選択10変種のV/F計20条件を確認しました。これらの範囲には重複があり、合計を全体の確認件数として数えません。現行500変種すべての成立確認、ZAP/Burpの検出率や顧客環境への適用可否はまだ測定していません。

- [起動とケース切替](web-benchmark/README.md)
- [実装範囲と検証状態](web-benchmark/README-coverage.md)
- [ZAPの実行](web-benchmark/README-zap.md)・[実験計画](web-benchmark/README-panel.md)・[証拠評価](web-benchmark/README-evaluation.md)
- [500変種の設計データ](benchmark-design-v2.json)

Docker DesktopのLinux containersを起動し、`web-benchmark`で `docker compose up --build -d --wait` を実行します。既定の公開ポートはローカルホストの8080、8443、8444です。詳細は実行手順を参照してください。

検証はWindowsで`.\verify.cmd`、macOS/Linuxで`sh verify.sh`です。保存済みの結果とZAPのHTMLレポートを一覧化するには`.\reports.cmd`または`sh reports.sh`を実行し、`artifacts/index.html`を開きます。

このリポジトリには実験専用の自己署名TLS秘密鍵 `web-benchmark/src/tls/local.key` が含まれます。公開済みのfixtureとして扱い、この鍵や証明書を実運用システムに転用しないでください。診断ログ、管理者用計画、oracle、過去の受入結果は公開対象から外しています。
