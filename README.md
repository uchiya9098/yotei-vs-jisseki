# 予定 vs 実績（ToDo & コーチングAI）

要件定義に基づくMVPです。以下の順序で構築されています。

## ステップ1：環境構築とSupabaseスキーマ

1. [supabase.com](https://supabase.com) で新規プロジェクトを作成。
2. Supabaseダッシュボード → **SQL Editor** を開き、`supabase/schema.sql` の中身を貼り付けて実行。
   - `users` / `tasks` / `actual_logs` / `ai_reflections` の4テーブルが作成されます。
   - Row Level Security（本人のデータのみ操作可能）と、`auth.users` 作成時に `public.users` を自動生成するトリガーも含まれます。
   - Realtime（マルチデバイス同期）用に該当テーブルをpublicationへ追加しています。
3. Supabaseダッシュボード → **Authentication → Providers → Google** を有効化し、Google Cloud ConsoleのOAuthクライアントID/シークレットを設定。
   - 承認済みリダイレクトURIに `https://<プロジェクトID>.supabase.co/auth/v1/callback` を追加。

## ステップ2：Next.jsのディレクトリ構造と環境変数

```
src/
  app/
    page.tsx              # メインダッシュボード（サーバーコンポーネント）
    layout.tsx
    globals.css
    login/page.tsx         # Googleログイン画面
    auth/callback/route.ts # OAuthコールバック処理
    api/ai-coach/route.ts  # Gemini API 呼び出し（サーバー側のみ）
  components/
    Dashboard.tsx           # 状態管理・CRUD・Realtime同期・AI連携の中枢
    Header.tsx               # 日付ナビ／ユーザー／同期状態
    TaskList.tsx             # 予定ToDoリスト＋転記ボタン
    ActualTimeline.tsx       # 実績の編集
    DiffSummary.tsx          # 予定vs実績の集計・カラーコード表示
    AiCoachChat.tsx          # AI対話チャットUI
  lib/
    supabase/client.ts       # ブラウザ用Supabaseクライアント
    supabase/server.ts       # サーバー用Supabaseクライアント
    utils.ts                 # 分計算・差分計算などの共通ロジック
  middleware.ts               # 認証セッション管理・未ログインリダイレクト
  types/database.ts           # DBの型定義
supabase/schema.sql
```

1. `.env.local.example` を `.env.local` にコピーし、値を埋める：
   - `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`：Supabase プロジェクト設定 → API
   - `GEMINI_API_KEY`：[Google AI Studio](https://aistudio.google.com/apikey) で発行（**サーバー側のみで使用**、`NEXT_PUBLIC_` は付けない）
   - `NEXT_PUBLIC_SITE_URL`：ローカルは `http://localhost:3000`、本番はVercelのURL
2. 依存関係をインストールして起動：
   ```bash
   npm install
   npm run dev
   ```

## ステップ3：Googleログイン認証とタスクCRUD

- `src/middleware.ts` が未ログイン時に `/login` へリダイレクトし、ログイン中は毎リクエストでセッションをリフレッシュします。
- `src/app/login/page.tsx` の「Googleでログイン」ボタン → Supabase Auth の `signInWithOAuth` → `/auth/callback` で認可コードをセッションに交換 → `/` へ。
- `Dashboard.tsx` が日付ごとに `tasks` / `actual_logs` / `ai_reflections` を取得し、Supabase Realtime（`postgres_changes`）を購読してPC・スマホ間の変更を即座に反映します。
- 予定の「転記」ボタン（`TaskList.tsx`）を押すと、同じタイトル・時間で `actual_logs` に1件INSERTされ（`Dashboard.transcribeTask`）、`ActualTimeline.tsx` 側でタイトル・時間・メモを個別に修正できます。
- 予定時間と実績時間の差分は `lib/utils.ts` の `buildTaskDiffs` が計算し、`DiffSummary.tsx` で達成率・超過合計・短縮合計とカラーコード付き一覧を表示します。

## ステップ4：AIコーチングチャット（Google AI Studio API）

- `src/app/api/ai-coach/route.ts` がサーバー上でのみ `GEMINI_API_KEY` を使い `@google/genai` 経由で Gemini（Gemini（既定 `gemini-2.5-flash`、環境変数 `GEMINI_MODEL` で変更可。`gemini-1.5-*` は提供終了のため非推奨）を呼び出します。
- 「振り返りを始める」を押すと、その日の予定/実績の差分テキストをプロンプトに含めてAIが最初の問いかけを生成します（`mode: "start"`）。
- ユーザーがチャット欄に回答すると、これまでの会話履歴とともに再度APIを呼び出し、AIが行動パターンの分析や改善提案を返します（`mode: "reply"`）。
- 会話は `ai_reflections.messages`（JSON配列）に保存され、日付ごとの振り返り履歴として残ります。週次・月次の傾向分析UIは未実装（将来拡張ポイント）。

## 未実装・今後の拡張候補

- `ai_reflections.summary_analysis` を自動生成するバッチ処理
- PWAアイコン画像一式（`public/manifest.json` の `icons` が空）

---

## 追加改修（UI強化・機能制限緩和・振り返り画面）

### 追加インストールが必要なライブラリ

```bash
npm install @radix-ui/react-popover react-day-picker @hello-pangea/dnd tailwindcss-animate
```

`package.json` には既に追記済みなので、`npm install` を再実行するだけでOKです。

### 1. カレンダーポップアップによる日付選択

- 新規: `src/components/ui/popover.tsx`（`@radix-ui/react-popover` のラッパー）
- 新規: `src/components/ui/calendar.tsx`（`react-day-picker` のラッパー、配色をアプリのトークンに合わせて調整）
- 修正: `src/components/Header.tsx` — 日付表示ボタンを `Popover` のトリガーにし、クリックで月カレンダーを表示。日付を選ぶと `onSelectDate` 経由で即座にその日のデータへ移動します。「今日へ」ボタンも追加し、今日以外を見ているときだけ表示されます。
- 修正: `src/components/Dashboard.tsx` — `selectedDate` と `onSelectDate` を `Header` に渡すよう変更。

### 2. AIコーチングの起動条件緩和

- 修正: `src/components/Dashboard.tsx` — `AiCoachChat` に渡す `hasDiffData` を `diffs.some(d => d.diffMinutes !== null)` から `actuals.length > 0` に変更。予定の時間が未設定でも、実績が1件でもあればボタンが押せます。
- 修正: `src/app/api/ai-coach/route.ts` — システムプロンプトに「予定に時間がない場合は実績の時間・メモから傾向を読み取る」旨の指示を追加し、`mode: "start"` 時のユーザーメッセージにもその補足を追加。
- `Dashboard.buildDiffContext()` は元々、予定時間が無くても `予定―分` として実績データを含めて出力するため、追加の構造変更は不要です。

### 3. ドラッグ＆ドロップによる並び替え

- ライブラリ: `@hello-pangea/dnd`（`react-beautiful-dnd` の保守版）。
- マイグレーション: `supabase/migrations/002_add_features.sql` を実行し、`actual_logs` に `sort_order` カラムを追加してください（`tasks.sort_order` は元のスキーマに既に存在）。
- 修正: `src/components/TaskList.tsx` / `src/components/ActualTimeline.tsx` — `DragDropContext` / `Droppable` / `Draggable` でリストをラップし、左端にドラッグハンドル（`GripVertical` アイコン）を追加。スマホでは長押ししてそのままドラッグできます（`touch-none` 指定済み）。
- 修正: `src/components/Dashboard.tsx` — `reorderTasks` / `reorderActuals` を追加。ドロップ確定後に配列を並び替えて楽観的更新しつつ、各行の `sort_order` を一括でSupabaseに反映します。
- 一覧の取得順序も `sort_order` 昇順に変更済みです。

### 4. 週次・月次の振り返りサマリー画面（`/summary`）

- マイグレーション: `supabase/migrations/002_add_features.sql` に含まれる `ai_period_summaries` テーブル（AIレポートの保存用、期間ごとに再生成可能）。
- 新規: `src/app/summary/page.tsx`（サーバーコンポーネント、未ログイン時は `/login` へリダイレクト）
- 新規: `src/components/SummaryDashboard.tsx`
  - 「今週 / 先週 / 今月」タブ（`lib/utils.ts` の `getPeriodRange` で期間の開始日・終了日を算出）
  - 集計カード：達成率、総実績時間、超過合計／短縮合計（`buildTaskDiffs` を期間内の全タスク・実績に対して実行）
  - 日別の実績時間ブレークダウン
  - 「AI分析を生成」ボタン：期間内の集計データ＋各日の `ai_reflections` 対話ログをまとめて `/api/ai-summary` に送信し、Geminiが「行動傾向／分析／来週・来月への改善アドバイス」の3項目でレポートを生成。結果は `ai_period_summaries` に保存され、次回開いたときはそのまま表示（「再生成する」で更新可能）。
- 新規: `src/app/api/ai-summary/route.ts`（サーバー側のみで `GEMINI_API_KEY` を使用、`gemini-1.5-pro` を利用）
- 修正: `src/components/Header.tsx` にサマリー画面への導線リンクを追加。

### 反映後の再セットアップ手順

```bash
# 1. 新しいマイグレーションを適用（Supabase SQL Editorで002_add_features.sqlを実行）
# 2. ライブラリを追加
npm install
# 3. 開発サーバー再起動
npm run dev
```

---

### 週次・月次サマリーの任意期間ナビゲーション

- マイグレーション: `supabase/migrations/003_period_navigation.sql` を実行してください（`ai_period_summaries.period_type` の許容値を `'this_week'/'last_week'/'this_month'` から `'week'/'month'` に変更します。どの週・月かは `period_start`/`period_end` で一意に特定します）。
- `SummaryDashboard.tsx` は「週表示／月表示」の2タブ＋`anchorDate`（基準日）で期間を管理する方式に変更。`◀`/`▶`ボタンで週なら±7日、月なら±1ヶ月移動でき、日付ラベルをクリックするとカレンダーから任意の日を選んでその週・月へジャンプできます。今日を含まない期間を見ているときは「今週/今月に戻る」ボタンが表示されます。
- 「期間内の実績一覧」は `mode === "week"` のときは何週遡っても表示され、`month`表示のときは非表示のままです。
- `lib/utils.ts` に `getRangeForMode` / `addDays` / `addMonths` / `rangeIncludesToday` を追加し、期間計算のロジックを集約しています。

---

### デイリー画面：「今週のToDo」サイドドロワー

- マイグレーション: `supabase/migrations/004_weekly_todo_pool.sql` を実行してください。`weekly_todos` テーブル（`week_start`＝その週の月曜日でスコープ、`assigned_task_id`/`assigned_date`で本日の予定への転送状況を記録）を追加します。
- 新規: `src/components/WeeklyTodoDrawer.tsx` — 画面右端に常時表示される折りたたみタブ（未完了件数バッジ付き）。タップでドロワーが開き、タイトル・予定時間（分）を入力して今週のプールに追加、チェックで完了、削除、タイトルはIME対応の`DebouncedTextInput`でインライン編集できます。
- 転送方法は2通り実装済みです：
  1. 各アイテムの「今日やる」ボタン
  2. ドロワー内のアイテムを左側の「予定 ToDo」エリアへドラッグ＆ドロップ
  - どちらも `Dashboard.assignWeeklyTodoToday` を呼び、表示中の日付（`dateKey`）の `tasks` に新規登録した上で、元の `weekly_todos` 行に `assigned_task_id` / `assigned_date` を記録します。
  - 対象日にすでに転送済みのアイテムは「本日追加済み」バッジ＋「今日やる」ボタンが無効化された「追加済み」表示になります（別の日には改めて転送可能）。
- D&Dは`Dashboard.tsx`の1つの`DragDropContext`に集約し、`droppableId`（`task-list` / `actual-list` / `weekly-pool`）で同一リスト内の並び替えとプール→予定への転送を`handleDragEnd`内で振り分けています。そのため`TaskList.tsx`/`ActualTimeline.tsx`は個別の`DragDropContext`を持たない作りに変更しています。
- 「今週のToDo」は表示中の日付（`selectedDate`）に関わらず、常に実際のカレンダー上の「今週」（月曜始まり）のデータを表示します。

---

### Markdownエクスポート（NotebookLM等への取り込み用）

- 新規: `src/components/MarkdownExportDialog.tsx` — ヘッダー（デイリー画面・`/summary`画面の両方）から開ける「Markdown出力」ダイアログ。開始日・終了日（最大7日間、`<input type="date">`のmin/maxで相互に制約）を選び、「ダウンロード（.md）」または「クリップボードにコピー」を実行できます。
- 出力時は選択期間の`tasks`/`actual_logs`/`ai_reflections`を一括取得し、日付ごとに以下の構造でMarkdownを生成します：見出し（`# 【期間】...`）→ 日付ごとの `## yyyy年mm月dd日(曜日)` セクション→「集計サマリー」（達成率・超過合計・短縮合計）→「タスク一覧（予定 vs 実績）」表→「当日のAIコーチング・振り返り」（`ai_reflections.messages`をユーザー/AIの発言として列挙、無ければ「記録なし」）。
- テーブルのセル内に`|`や改行が含まれていても壊れないよう、出力前にエスケープ・単一行化しています。
- `lib/utils.ts`に`formatFullDateLabel`（`2026年8月10日(月)`形式）と`getDateKeysInRange`（範囲内の日付を列挙）を追加。
- 合わせて`toDateKey`の実装を`Date.toISOString()`ベース（UTC変換）から、ローカルの年月日をそのまま使う実装に修正しました。日本など UTC より進んだタイムゾーンでは、深夜帯に日付が1日ずれる可能性があった潜在バグです。

---

### ゲストモード（ログイン不要のローカル利用）とクラウド自動同期

**追加ライブラリ**：なし（`localStorage`・`crypto.randomUUID()`など標準APIのみ使用）

**ストレージ抽象化レイヤー**：`src/lib/storage/`
- `types.ts` — `StorageAdapter`インターフェース。`tasks`/`actual_logs`/`weekly_todos`/`ai_reflections`のCRUDと変更検知購読を定義。
- `local-storage-adapter.ts` — 未ログイン時に使う実装。`window.localStorage`にテーブルごとJSON配列で保存（`yotei_local_tasks`等のキー）。IDは`crypto.randomUUID()`で発行し、Supabaseのuuid主キーとそのまま互換になるようにしている。`hasAnyLocalData` / `getAllLocalData` / `clearAllLocalData`という同期用の補助関数も export。
- `supabase-storage-adapter.ts` — ログイン時に使う実装。これまでDashboard.tsxに直書きしていたSupabase呼び出しをこの形にまとめ直したもの（挙動は従来と同じ）。
- `use-storage-adapter.ts` — `userId`があればSupabaseアダプター、なければローカルアダプターを返す`useStorageAdapter`フック。**コンポーネント側（Dashboard.tsx）はこのフックが返すオブジェクトのメソッドだけを呼び、ログイン状態を個別に分岐しない。**
- `sync-local-to-cloud.ts` — ログイン直後にローカルデータを一括アップロードする`syncLocalDataToCloud(userId)`。ローカルで発行したUUIDをそのまま`id`としてupsertするため、実績の`task_id`や今週のToDoの`assigned_task_id`が指す紐づきをID変換なしに維持できる。外部キー制約があるため`tasks → actual_logs / weekly_todos → ai_reflections`の順で逐次アップロードし、全件成功した場合のみローカルをクリアする（部分失敗時は次回ログイン時に自動リトライされる＝upsertなので重複しない）。

**認証フロー・画面遷移の変更**
- `middleware.ts`：`/`（デイリー画面）は未ログインでもリダイレクトしないよう変更。`/summary`など`PROTECTED_ROUTES`に列挙したページのみ、引き続き未ログイン時に`/login`へリダイレクトする。
- `src/app/page.tsx`：`redirect("/login")`を削除し、`user?.id ?? null`を`Dashboard`へそのまま渡す。
- `src/app/login/page.tsx`：「ゲストのまま続ける」リンクを追加。ローカルに未同期データがある場合は「ログインすると自動的にクラウドへ同期されます」という案内を表示。
- `Header.tsx`：`userId`を`string | null`に変更。未ログイン時は右上に「ログイン / クラウド同期」ボタンを表示し、ログイン時は従来通りアバター＋ログアウトボタンを表示。ログアウト後の遷移先も`/login`から`/`（ゲストモード）に変更。「Markdown出力」「週次・月次サマリー」はクラウド専用機能として、ログイン時のみ表示。

**同期のタイミング**
- Google OAuthはリダイレクトを伴うため、ゲスト→ログインの遷移は必ず`Dashboard`の再マウントを伴う。`Dashboard.tsx`はマウント時に`userId`が存在し、かつ`hasAnyLocalData()`が`true`の場合にのみ`syncLocalDataToCloud`を自動実行し、完了後に「ローカルのデータをクラウドに同期しました（予定n件 / 実績n件 / 今週のToDo n件 / 振り返りn件）」というバナーを表示する。

**スコープについて**：今回のローカル対応は日次ダッシュボード（予定・実績・今週のToDo・AIコーチングの振り返り）が対象です。「週次・月次サマリー」画面（`/summary`）とMarkdownエクスポートは、複数日にまたがる集計・分析機能のためクラウド（ログイン）専用のまま据え置いています。ゲストモードでもこれらを使えるようにしたい場合はお知らせください。

---

### 「今週のToDo」：週の切り替えと未完了タスクの繰り越し

**マイグレーション・追加ライブラリ：なし**（`weekly_todos.week_start` を使うだけで、DBスキーマの変更は不要です）

- ドロワー上部に「← 前の週 / 次の週 →」と対象週（例：`10/5 〜 10/11`）を表示。今週以外を見ているときは「先週・今週へ戻る」リンクを表示します。タイトルも「今週のToDo」「先週のToDo」「3週前のToDo」のように変わります。
- 取得は `StorageAdapter.listWeeklyTodos(weekStart)`（ローカル／Supabase どちらも元から週指定に対応）をそのまま使い、`Dashboard.tsx` が持つ表示週 `viewWeekKey` で呼び分けます。週を素早く連打しても、遅れて返ってきた古い週の結果で上書きしないよう取得ごとに連番で判定しています。
- 過去の週で未完了タスクがある場合、ドロワー上部に「未完了N件を今週へ繰り越す」（一括）、各タスクに「今週へ繰り越す」（個別）を表示します。`week_start` を今週に更新し、今週リストの末尾に並びます（`sort_order` は今週の最大値の続きから採番）。完了済みや今週以降のタスクは、呼び出し側から渡されても動かしません。
- 週タスクの追加は「表示中の週」に入ります（来週を見ていれば来週の計画として追加できます）。
- ドロワーを閉じると表示は今週に戻ります（閉じている間のトグルタブの未完了バッジを、常に今週の件数にするため）。
- インライン編集・D&D・「今日やる」は従来どおりどの週でも動作します。週を切り替えると編集中の行は編集モードを解除します。
- `lib/utils.ts` に `parseDateKey` / `shiftWeekKey` / `formatWeekRangeLabel` / `getWeekRelationLabel` を追加。


## トラブルシュート: AIコーチが「うまく応答できませんでした」になる

原因と対処（修正済み）:
- 会話履歴の先頭が `model` 発言だと Gemini が 400 を返す → 当日の予定/実績を最初の `user` ターンとして必ず補い、連続同roleは結合。
- 旧モデル名（`gemini-1.5-*`）の提供終了 → 既定を `gemini-2.5-flash` に変更（`GEMINI_MODEL` で上書き可）。
- クライアントがエラーを握りつぶしていた → APIは `{ error, code, hint }` を返し、チャットに原因と「もう一度送る」ボタンを表示。
- `GEMINI_API_KEY` 未設定時は「APIキーが設定されていません」と明示（環境変数変更後は開発サーバー再起動）。
- 詳細はサーバーログ（`[ai-coach] ...`）に出力。`/api/*` は認証不要なのでゲストモードでも動作します。
