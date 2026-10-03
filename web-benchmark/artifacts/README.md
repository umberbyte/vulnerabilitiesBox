# 実行結果と管理者用データ

この公開リポジトリには、診断の生ログ、管理者用計画、oracle、過去の実行結果を含めません。実行時に生成したファイルをこのディレクトリへ保存してください。`verify.cmd`または`verify.sh`の実行後は、`full-regression.md`で人が読める結果を、`full-regression.json`で機械向け結果を確認できます。選択した10変種の局所Docker確認20条件だけ、秘密値を含まない[結果](docker-smoke-selected.json)を掲載しています。再実行時のスモーク結果は`docker-smoke-selected-run.json`へ保存します。

Windowsは`reports.cmd`、macOS/Linuxは`sh reports.sh`で、保存済みの回帰結果・診断台帳・ZAP生成HTML・レビュー記録を集めた`index.html`と`report-index.json`を生成できます。ネットワーク通信、診断、ケース切替は行いません。生成された一覧も利用者ごとのローカル資料で、公開Gitには含めません。
