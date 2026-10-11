
import * as vscode from 'vscode';

type WebviewMessage = {
    command: string;
    amount?: number;
};

type BugQuestion = {
    title: string;
    code: string;
    question: string;
    answers: string[];
    correct: number;
};

export function activate(context: vscode.ExtensionContext) {
    console.log('CodeBuddy RPG is now active!');

    // -------------------------
    // Player XP and levels
    // -------------------------

    const getXP = (): number => {
        return context.globalState.get<number>('playerXP', 0);
    };
	const getAchievements = (): string[] => {
    return context.globalState.get<string[]>('playerAchievements', []);
    };
	const unlockAchievement = async (
    id: string,
    title: string,
    panel: vscode.WebviewPanel
) => {
    const achievements = getAchievements();

    // Не выдаём одну награду повторно
    if (achievements.includes(id)) {
        return;
    }

    achievements.push(id);

    await context.globalState.update(
        'playerAchievements',
        achievements
    );

    sendPlayerStats(panel);

    vscode.window.showInformationMessage(
        `🏆 Achievement unlocked: ${title}!`
    );
    };
    const getLevel = (xp: number): number => {
        return Math.floor(xp / 100) 
		+ 1;
    };

    const sendPlayerStats = (panel: vscode.WebviewPanel) => {
        const xp = getXP();

        panel.webview.postMessage({
        command: 'updateXP',
        xp,
        level: getLevel(xp),
        progress: xp % 100,
        xpToNextLevel: 100 - (xp % 100),
        achievements: getAchievements().length,
		unlockedAchievements: getAchievements(),
	});}

    const addXP = async (
        amount: number,
        panel: vscode.WebviewPanel
    ) => {
        if (amount <= 0) {
            return;
        }

        const oldXP = getXP();
        const newXP = oldXP + amount;

        await context.globalState.update('playerXP', newXP);

        const oldLevel = getLevel(oldXP);
        const newLevel = getLevel(newXP);

        sendPlayerStats(panel);

        if (newLevel > oldLevel) {
            vscode.window.showInformationMessage(
                `Level Up! You reached Level ${newLevel}!`
            );
        } else {
            vscode.window.showInformationMessage(
                `+${amount} XP! Total: ${newXP} XP`
            );
        }
    };

    // -------------------------
    // Hello World command
    // -------------------------

    const helloCommand = vscode.commands.registerCommand(
        'codebuddy-rpg.helloWorld',
        () => {
            vscode.window.showInformationMessage(
                'Hello World from CodeBuddy RPG!'
            );
        }
    );

    // -------------------------
    // Dashboard
    // -------------------------

    const dashboardCommand = vscode.commands.registerCommand(
        'codebuddy-rpg.openDashboard',
        () => {
            const panel = vscode.window.createWebviewPanel(
                'codebuddyDashboard',
                'CodeBuddy RPG',
                vscode.ViewColumn.One,
                {
                    enableScripts: true
                }
            );

            panel.webview.html = getDashboardHtml();

            panel.webview.onDidReceiveMessage(
                async (message: WebviewMessage) => {
                    switch (message.command) {
                        case 'ready':
                            sendPlayerStats(panel);
                            break;

                        case 'startFocus':
                            panel.webview.postMessage({
                                command: 'startFocus'
                            });
                            break;

                        case 'pauseFocus':
                            panel.webview.postMessage({
                                command: 'pauseFocus'
                            });
                            break;

                        case 'resetFocus':
                            panel.webview.postMessage({
                                command: 'resetFocus'
                            });
                            break;

                        case 'focusCompleted': {
							vscode.window.showInformationMessage(
								'Focus session completed! Great work!'
							);

							await unlockAchievement(
								'focused-coder',
								'Focused Coder',
								panel
							);

							break;
						}

                        case 'awardXP': {
							await addXP(message.amount ?? 10, panel);

							// Первая успешно решённая задача
							await unlockAchievement(
								'bug-hunter',
								'Bug Hunter',
								panel
							);

							// Достижение за накопление 100 XP
							if (getXP() >= 100) {
								await unlockAchievement(
									'century-club',
									'Century Club',
									panel
								);
							}

							break;
						}

                        case 'viewStats': {
                            const editor = vscode.window.activeTextEditor;

                            if (!editor) {
                                vscode.window.showWarningMessage(
                                    'Open a code file first!'
                                );
                                return;
                            }

                            const text = editor.document.getText();
                            const lines = text.split(/\r?\n/);

                            let codeLines = 0;
                            let commentLines = 0;
                            let blankLines = 0;
                            let insideBlockComment = false;

                            for (const line of lines) {
                                const trimmed = line.trim();

                                if (trimmed === '') {
                                    blankLines++;
                                    continue;
                                }

                                if (insideBlockComment) {
                                    commentLines++;

                                    if (trimmed.includes('*/')) {
                                        insideBlockComment = false;
                                    }

                                    continue;
                                }

                                if (
                                    trimmed.startsWith('//') ||
                                    trimmed.startsWith('#')
                                ) {
                                    commentLines++;
                                } else if (trimmed.startsWith('/*')) {
                                    commentLines++;
                                    insideBlockComment =
                                        !trimmed.includes('*/');
                                } else {
                                    codeLines++;
                                }
                            }

                            panel.webview.postMessage({
                                command: 'showStats',
                                total: lines.length,
                                code: codeLines,
                                comments: commentLines,
                                blank: blankLines
                            });

                            break;
                        }

                        case 'playBugHunter': {
                            const question: BugQuestion = {
                                title: 'Bug Hunter — Level 1',
                                code: 'let score = 10;\nscore = "20";',
                                question:
                                    'What is the main issue in this JavaScript code?',
                                answers: [
                                    'The variable changes from a number to a string',
                                    'The code has a missing semicolon',
                                    'The variable is never declared'
                                ],
                                correct: 0
                            };

                            panel.webview.postMessage({
                                command: 'showBugHunter',
                                question
                            });

                            break;
                        }
                    }
                },
                undefined,
                context.subscriptions
            );
        }
    );

    context.subscriptions.push(
        helloCommand,
        dashboardCommand
    );
}

function getDashboardHtml(): string {
    return /* html */ `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">

    <style>
        :root {
            color-scheme: dark;
        }

        * {
            box-sizing: border-box;
        }

        body {
            margin: 0;
            padding: 32px 24px 48px;
            font-family: var(--vscode-font-family);
            font-size: 14px;
            line-height: 1.5;
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
        }

        .container {
            max-width: 1000px;
            margin: 0 auto;
        }

        .hero {
            margin-bottom: 28px;
        }

        .brand {
            display: flex;
            align-items: center;
            gap: 12px;
            margin: 0;
            font-size: 30px;
            font-weight: 750;
            letter-spacing: -0.8px;
        }

        .brand-icon {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 46px;
            height: 46px;
            border-radius: 14px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            font-size: 24px;
        }

        .subtitle {
            margin: 8px 0 0;
            color: var(--vscode-descriptionForeground);
            font-size: 14px;
        }

        .card {
            min-width: 0;
            padding: 24px;
            margin-bottom: 20px;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 16px;
            background: var(--vscode-sideBar-background);
        }

        .card-heading {
            display: flex;
            align-items: center;
            gap: 10px;
            margin: 0 0 22px;
            font-size: 19px;
            font-weight: 700;
        }

        .heading-icon {
            font-size: 22px;
        }

        .profile-grid {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 14px;
        }

        .stat-card {
            min-width: 0;
            padding: 18px;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 12px;
            background: var(--vscode-editor-background);
        }

        .stat-label {
            margin-bottom: 8px;
            color: var(--vscode-descriptionForeground);
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 1px;
            text-transform: uppercase;
        }

        .stat-value {
            margin: 0;
            font-size: 27px;
            line-height: 1.25;
            font-weight: 750;
            overflow-wrap: anywhere;
        }

        .stat-caption {
            margin-top: 5px;
            color: var(--vscode-descriptionForeground);
            font-size: 12px;
        }

        .progress-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            margin-top: 25px;
            margin-bottom: 10px;
        }

        .progress-title {
            font-weight: 600;
        }

        .progress-value {
            color: var(--vscode-descriptionForeground);
            font-size: 12px;
            white-space: nowrap;
        }

        .progress-track {
            width: 100%;
            height: 10px;
            overflow: hidden;
            border-radius: 20px;
            background: var(--vscode-progressBar-background);
        }

        .progress-fill {
            width: 0%;
            height: 100%;
            border-radius: inherit;
            background: var(--vscode-textLink-foreground);
            transition: width 250ms ease;
        }

        .progress-note {
            margin: 10px 0 0;
            color: var(--vscode-descriptionForeground);
            font-size: 12px;
        }

        .timer-card {
            text-align: center;
        }

        .timer-card .card-heading {
            text-align: left;
        }

        .timer-description {
            margin: -12px 0 20px;
            color: var(--vscode-descriptionForeground);
        }

        .timer-display {
            margin: 12px 0 20px;
            font-size: clamp(44px, 8vw, 64px);
            font-weight: 750;
            letter-spacing: 2px;
            font-variant-numeric: tabular-nums;
        }

        .timer-status {
            min-height: 22px;
            color: var(--vscode-descriptionForeground);
            font-size: 12px;
        }

        .timer-controls {
            display: flex;
            justify-content: center;
            flex-wrap: wrap;
            gap: 10px;
        }

        button {
            min-height: 38px;
            padding: 9px 16px;
            border: 1px solid var(--vscode-button-border, transparent);
            border-radius: 8px;
            color: var(--vscode-button-foreground);
            background: var(--vscode-button-background);
            font: inherit;
            font-weight: 600;
            cursor: pointer;
            transition: background 120ms ease, opacity 120ms ease;
        }

        button:hover {
            background: var(--vscode-button-hoverBackground);
        }

        button:focus-visible {
            outline: 2px solid var(--vscode-focusBorder);
            outline-offset: 2px;
        }

        button:disabled {
            cursor: not-allowed;
            opacity: 0.55;
        }

        button.secondary {
            color: var(--vscode-foreground);
            background: var(--vscode-input-background);
            border-color: var(--vscode-panel-border);
        }

        button.secondary:hover {
            background: var(--vscode-list-hoverBackground);
        }

        .section-title {
            margin: 30px 0 16px;
            font-size: 21px;
            font-weight: 750;
        }

        .features {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 16px;
        }

        .feature {
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            min-width: 0;
            padding: 22px;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 14px;
            background: var(--vscode-sideBar-background);
        }

        .feature-icon {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 42px;
            height: 42px;
            margin-bottom: 15px;
            border-radius: 12px;
            background: var(--vscode-editor-background);
            font-size: 22px;
        }

        .feature h3 {
            margin: 0 0 6px;
            font-size: 16px;
        }

        .feature-description {
            flex: 1;
            margin: 0 0 12px;
            color: var(--vscode-descriptionForeground);
            font-size: 13px;
        }

        .feature > button {
            width: 100%;
            margin-top: auto;
        }
		        /* Achievements */
        .achievements-grid {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 16px;
        }

        .achievement-item {
            padding: 18px;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 12px;
            background: var(--vscode-editor-background);
        }

        .achievement-item.locked {
            opacity: 0.55;
        }

        .achievement-icon {
            margin-bottom: 10px;
            font-size: 28px;
        }

        .achievement-item h3 {
            margin: 0 0 6px;
            font-size: 15px;
        }

        .achievement-item p {
            margin: 0;
            color: var(--vscode-descriptionForeground);
            font-size: 12px;
        }

        .achievement-status {
            display: inline-block;
            margin-top: 12px;
            font-size: 12px;
            font-weight: 700;
        }

        @media (max-width: 600px) {
            .achievements-grid {
                grid-template-columns: 1fr;
            }
        }

        .result {
            width: 100%;
            margin-top: 14px;
            overflow-wrap: anywhere;
        }

        .stats-result {
            padding: 12px;
            border-radius: 8px;
            background: var(--vscode-editor-background);
            font-size: 12px;
        }

        .stats-result p {
            margin: 4px 0;
        }

        .game-title {
            margin: 14px 0 8px;
            font-size: 14px;
        }

        pre {
            max-width: 100%;
            padding: 14px;
            overflow-x: auto;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            background: var(--vscode-editor-background);
            font-family: var(--vscode-editor-font-family);
            font-size: 13px;
            white-space: pre;
        }

        .answer-button {
            width: 100%;
            margin-top: 8px;
            text-align: left;
            font-size: 12px;
            overflow-wrap: anywhere;
        }

        .game-feedback {
            margin-top: 12px;
            font-weight: 600;
        }

        .footer {
            margin-top: 26px;
            color: var(--vscode-descriptionForeground);
            font-size: 12px;
            text-align: center;
        }

        @media (max-width: 600px) {
            body {
                padding: 20px 12px 32px;
            }

            .card {
                padding: 17px;
            }

            .brand {
                font-size: 25px;
            }

            .profile-grid {
                grid-template-columns: 1fr;
            }

            .stat-card {
                padding: 14px;
            }

            .stat-value {
                font-size: 24px;
            }

            .features {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>

<body>
    <main class="container">
        <header class="hero">
            <h1 class="brand">
                <span class="brand-icon">⚔️</span>
                CodeBuddy RPG
            </h1>
            <p class="subtitle">
                Level up your coding skills, one challenge at a time.
            </p>
        </header>

        <section class="card">
            <h2 class="card-heading">
                <span class="heading-icon">🏆</span>
                Developer Profile
            </h2>

            <div class="profile-grid">
                <div class="stat-card">
                    <div class="stat-label">Current level</div>
                    <p class="stat-value" id="playerLevel">Level 1</p>
                    <div class="stat-caption">Your coding rank</div>
                </div>

                <div class="stat-card">
                    <div class="stat-label">Experience</div>
                    <p class="stat-value">
                        <span id="playerXP">0</span>
                        <span style="font-size: 15px;">XP</span>
                    </p>
                    <div class="stat-caption">Total experience earned</div>
                </div>

                <div class="stat-card">
                    <div class="stat-label">Achievements</div>
                    <p class="stat-value" id="achievements">0</p>
                    <div class="stat-caption">Unlocked rewards</div>
                </div>
            </div>

            <div class="progress-header">
                <span class="progress-title">Next level</span>
                <span class="progress-value" id="progressText">
                    0 / 100 XP
                </span>
            </div>

            <div
                class="progress-track"
                role="progressbar"
                id="xpProgress"
                aria-label="Progress to next level"
                aria-valuemin="0"
                aria-valuemax="100"
                aria-valuenow="0"
            >
                <div class="progress-fill" id="progressFill"></div>
            </div>

            <p class="progress-note" id="progressNote">
                Earn XP by completing coding challenges.
            </p>
        </section>

        <section class="card timer-card">
            <h2 class="card-heading">
                <span class="heading-icon">⏱️</span>
                Focus Timer
            </h2>

            <p class="timer-description">
                Stay focused. Finish a session. Keep improving.
            </p>

            <div
                class="timer-display"
                id="timer"
                role="timer"
                aria-live="off"
            >25:00</div>

            <div class="timer-status" id="timerStatus">
                Ready when you are
            </div>

            <div class="timer-controls">
                <button id="timerStart">▶ Start</button>
                <button id="timerPause" class="secondary">Ⅱ Pause</button>
                <button id="timerReset" class="secondary">↺ Reset</button>
            </div>
        </section>
		        <section class="card">
            <h2 class="card-heading">
                <span class="heading-icon">🏅</span>
                Achievements
            </h2>

            <div class="achievements-grid">
                <article class="achievement-item locked" id="achievement-bug-hunter">
                    <div class="achievement-icon">🐛</div>
                    <h3>Bug Hunter</h3>
                    <p>Answer a Bug Hunter question correctly.</p>
                    <span class="achievement-status">🔒 Locked</span>
                </article>

                <article class="achievement-item locked" id="achievement-focused-coder">
                    <div class="achievement-icon">🎯</div>
                    <h3>Focused Coder</h3>
                    <p>Complete a 25-minute focus session.</p>
                    <span class="achievement-status">🔒 Locked</span>
                </article>

                <article class="achievement-item locked" id="achievement-century-club">
                    <div class="achievement-icon">⭐</div>
                    <h3>Century Club</h3>
                    <p>Earn at least 100 XP.</p>
                    <span class="achievement-status">🔒 Locked</span>
                </article>
            </div>
        </section>
        <h2 class="section-title">🎮 Your Activities</h2>

        <div class="features">
            <section class="feature">
                <div class="feature-icon">📊</div>
                <h3>Code Statistics</h3>
                <p class="feature-description">
                    Analyze the code in your currently open file.
                </p>
                <button id="statsButton">Analyze my code</button>
                <div class="result" id="statsResult" aria-live="polite"></div>
            </section>

            <section class="feature">
                <div class="feature-icon">🐛</div>
                <h3>Bug Hunter</h3>
                <p class="feature-description">
                    Find a bug, test your knowledge, and earn 10 XP
                    for a correct answer.
                </p>
                <button id="bugButton">Play Bug Hunter</button>
                <div class="result" id="bugGame"></div>
            </section>
        </div>

        <footer class="footer">
            CodeBuddy RPG · Keep learning. Keep building.
        </footer>
    </main>

    <script>
        const vscode = acquireVsCodeApi();

        // -------------------------
        // XP profile
        // -------------------------

        function updateProfile(data) {
            document.getElementById('playerLevel').textContent =
                'Level ' + data.level;

            document.getElementById('playerXP').textContent =
                data.xp;

            document.getElementById('progressFill').style.width =
                data.progress + '%';

            document.getElementById('progressText').textContent =
                data.progress + ' / 100 XP';

            document.getElementById('progressNote').textContent =
                data.xpToNextLevel +
                ' XP remaining until Level ' +
                (data.level + 1);

            const progress = document.getElementById('xpProgress');
            progress.setAttribute('aria-valuenow', data.progress);
			            const unlocked = data.unlockedAchievements ?? [];

            document.getElementById('achievements').textContent =
                unlocked.length;

            const achievementCards = [
                {
                    id: 'bug-hunter',
                    title: 'Bug Hunter'
                },
                {
                    id: 'focused-coder',
                    title: 'Focused Coder'
                },
                {
                    id: 'century-club',
                    title: 'Century Club'
                }
            ];

            achievementCards.forEach(achievement => {
                const card = document.getElementById(
                    'achievement-' + achievement.id
                );

                if (!card) return;

                const isUnlocked = unlocked.includes(achievement.id);

                card.classList.toggle('locked', !isUnlocked);

                const status = card.querySelector('.achievement-status');

                if (status) {
                    status.textContent = isUnlocked
                        ? '🏆 Unlocked'
                        : '🔒 Locked';
                }
            });
        }

        // -------------------------
        // Focus timer
        // -------------------------

        const FOCUS_SECONDS = 25 * 60;
        let remainingSeconds = FOCUS_SECONDS;
        let timerInterval = null;

        function renderTimer() {
            const minutes = Math.floor(remainingSeconds / 60);
            const seconds = remainingSeconds % 60;

            document.getElementById('timer').textContent =
                String(minutes).padStart(2, '0') + ':' +
                String(seconds).padStart(2, '0');
        }

        function setTimerStatus(message) {
            document.getElementById('timerStatus').textContent = message;
        }

        function startTimer() {
            if (timerInterval !== null || remainingSeconds <= 0) {
                return;
            }

            setTimerStatus('Focus session in progress');

            timerInterval = setInterval(() => {
                remainingSeconds--;
                renderTimer();

                if (remainingSeconds <= 0) {
                    clearInterval(timerInterval);
                    timerInterval = null;
                    remainingSeconds = 0;

                    renderTimer();
                    setTimerStatus('Session complete! Great work.');

                    vscode.postMessage({
                        command: 'focusCompleted'
                    });
                }
            }, 1000);
        }

        function pauseTimer() {
            if (timerInterval !== null) {
                clearInterval(timerInterval);
                timerInterval = null;

                setTimerStatus('Session paused');
            }
        }

        function resetTimer() {
            pauseTimer();
            remainingSeconds = FOCUS_SECONDS;
            renderTimer();
            setTimerStatus('Ready when you are');
        }

        document.getElementById('timerStart').addEventListener(
            'click',
            startTimer
        );

        document.getElementById('timerPause').addEventListener(
            'click',
            pauseTimer
        );

        document.getElementById('timerReset').addEventListener(
            'click',
            resetTimer
        );

        // -------------------------
        // Buttons that call the extension
        // -------------------------

        document.getElementById('statsButton').addEventListener(
            'click',
            () => vscode.postMessage({ command: 'viewStats' })
        );

        document.getElementById('bugButton').addEventListener(
            'click',
            () => vscode.postMessage({ command: 'playBugHunter' })
        );

        // -------------------------
        // Messages from the extension
        // -------------------------

        window.addEventListener('message', event => {
            const data = event.data;

            if (data.command === 'startFocus') {
                startTimer();

            } else if (data.command === 'pauseFocus') {
                pauseTimer();

            } else if (data.command === 'resetFocus') {
                resetTimer();

            } else if (data.command === 'updateXP') {
                updateProfile(data);

            } else if (data.command === 'showStats') {
                const result = document.getElementById('statsResult');
                result.replaceChildren();

                const stats = [
                    ['Total lines', data.total],
                    ['Code lines', data.code],
                    ['Comment lines', data.comments],
                    ['Blank lines', data.blank]
                ];

                stats.forEach(([label, value]) => {
                    const p = document.createElement('p');
                    p.textContent = label + ': ' + value;
                    result.appendChild(p);
                });

                result.className = 'result stats-result';

            } else if (data.command === 'showBugHunter') {
                const game = document.getElementById('bugGame');
                const question = data.question;

                game.replaceChildren();

                const title = document.createElement('h4');
                title.className = 'game-title';
                title.textContent = question.title;
                game.appendChild(title);

                const code = document.createElement('pre');
                code.textContent = question.code;
                game.appendChild(code);

                const prompt = document.createElement('p');
                prompt.textContent = question.question;
                game.appendChild(prompt);

                question.answers.forEach((answer, index) => {
                    const button = document.createElement('button');
                    button.className = 'answer-button secondary';
                    button.textContent = answer;

                    button.addEventListener('click', () => {
                        const buttons = game.querySelectorAll('button');

                        buttons.forEach(item => {
                            item.disabled = true;
                        });

                        const feedback = document.createElement('p');
                        feedback.className = 'game-feedback';

                        if (index === question.correct) {
                            feedback.textContent = 'Correct! +10 XP';
                            vscode.postMessage({
                                command: 'awardXP',
                                amount: 10
                            });
                        } else {
                            feedback.textContent =
                                'Not quite. Try another challenge!';
                        }

                        prompt.textContent = '';
                        prompt.appendChild(feedback);
                    });

                    game.appendChild(button);
                });
            }
        });

        // Ask the extension for saved XP after the listener is ready.
        renderTimer();
        vscode.postMessage({ command: 'ready' });
    </script>
</body>
</html>`;
}

export function deactivate() {}
