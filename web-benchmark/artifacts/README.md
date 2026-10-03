# 実行結果と管理者用データ

この公開リポジトリには、診断の生ログ、管理者用計画、oracle、過去の実行結果を含めません。実行時に生成したファイルをこのディレクトリへ保存してください。`verify.cmd`または`verify.sh`の実行後は、`full-regression.md`で人が読める結果を、`full-regression.json`で機械向け結果を確認できます。選択した10変種の局所Docker確認20条件だけ、秘密値を含まない[結果](docker-smoke-selected.json)を掲載しています。再実行時のスモーク結果は`docker-smoke-selected-run.json`へ保存します。

Windowsは`reports.cmd`、macOS/Linuxは`sh reports.sh`で、保存済みの回帰結果・診断台帳・ZAP生成HTML・レビュー記録を集めた`index.html`と`report-index.json`を生成できます。ネットワーク通信、診断、ケース切替は行いません。生成された一覧も利用者ごとのローカル資料で、公開Gitには含めません。

`artifact-audit.md`と`artifact-audit.json`には、保存された計画・台帳・実行JSONのハッシュと条件の照合結果を記録します。V/F/N完走系列の数は実験系列の数で、検出した脆弱性の件数ではありません。台帳から参照されない実行は単独試験の可能性があり、無効とは自動判定しません。

`verify.cmd tools`／`sh verify.sh tools`は`tools-check.md`、`tools-check.json`、`tools-check.log`へ単体検証結果を保存します。新しい検証結果にはソーススナップショットを記録し、`reports.cmd`／`reports.sh`による一覧では現在のソースとの一致を表示します。古い結果にスナップショットがない場合は「記録なし」として扱います。

`coverage-inventory.md`と`coverage-inventory.json`は、設計500変種と保存された個別の成立確認記録を対応させます。旧形式の追加変種テストの集計は個別行へ配分せず、aggregateEvidenceに保持します。新形式は変種ID・根本原因ID・V/F/Nと合否だけを保存し、原本stdout中の秘密値や入力本文を棚卸しへ複写しません。
