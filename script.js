window.onerror = function (msg, url, lineNo, columnNo, error) {
    alert('DEBUG ERROR: ' + msg + '\nLine: ' + lineNo);
    return false;
};

document.addEventListener('DOMContentLoaded', () => {
    // UI Elements
    const elements = {
        micBtn: document.getElementById('micBtn'),
        micStatus: document.getElementById('micStatus'),
        ingredientsInput: document.getElementById('ingredientsInput'),
        moodBtns: document.querySelectorAll('.mood-btn'),
        generateBtn: document.getElementById('generateBtn'),
        settingsBtn: document.getElementById('settingsBtn'),
        settingsModal: document.getElementById('settingsModal'),
        closeSettingsBtn: document.getElementById('closeSettingsBtn'),
        apiKeyInput: document.getElementById('apiKeyInput'),
        saveKeyBtn: document.getElementById('saveKeyBtn'),
        toast: document.getElementById('toast'),
        outputSection: document.getElementById('outputSection'),
        loadingIndicator: document.getElementById('loadingIndicator'),
        recipesContainer: document.getElementById('recipesContainer')
    };

    // State
    let state = {
        apiKey: localStorage.getItem('gemini_api_key') || 'AIzaSyA7AFu11xmqnUyGdUmdqITDzIsy2Z7AHu4',
        isRecording: false,
        selectedMood: null,
        recognition: null
    };

    // Initialize Web Speech API
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
        state.recognition = new SpeechRecognition();
        state.recognition.lang = 'ja-JP';
        state.recognition.continuous = false; // Set continuous to false to stop automatically when user stops speaking
        state.recognition.interimResults = true;

        state.recognition.onstart = () => {
            state.isRecording = true;
            updateMicUI();
        };

        state.recognition.onresult = (event) => {
            let finalTranscript = '';
            let interimTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                } else {
                    interimTranscript += event.results[i][0].transcript;
                }
            }

            if (finalTranscript) {
                const currentVal = elements.ingredientsInput.value;
                // Add space if there is already text
                elements.ingredientsInput.value = currentVal ? `${currentVal.trim()} ${finalTranscript}` : finalTranscript;
            }
        };

        state.recognition.onerror = (event) => {
            console.error('Speech recognition error', event.error);
            state.isRecording = false;
            updateMicUI();
            if (event.error !== 'no-speech') {
                showToast('音声認識エラー: ' + event.error);
            }
        };

        state.recognition.onend = () => {
            state.isRecording = false;
            updateMicUI();
        };
    } else {
        elements.micBtn.disabled = true;
        elements.micBtn.classList.add('opacity-50', 'cursor-not-allowed');
        elements.micStatus.textContent = 'お使いのブラウザは音声入力非対応です';
    }

    // Event Listeners
    elements.micBtn.addEventListener('click', toggleRecording);
    elements.settingsBtn.addEventListener('click', openSettings);
    elements.closeSettingsBtn.addEventListener('click', closeSettings);
    elements.saveKeyBtn.addEventListener('click', saveApiKey);
    elements.generateBtn.addEventListener('click', generateRecipe);

    // Close modal on outside click
    elements.settingsModal.addEventListener('click', (e) => {
        if (e.target === elements.settingsModal) closeSettings();
    });

    // Mood Selection Logic
    elements.moodBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            elements.moodBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.selectedMood = btn.dataset.mood;
        });
    });

    // Check Key on Load
    if (!state.apiKey) {
        setTimeout(openSettings, 800);
    }

    // Functions
    function toggleRecording() {
        if (!state.recognition) return;

        if (state.isRecording) {
            state.recognition.stop();
        } else {
            try {
                // reset text input if we wanted to? No, better to append.
                state.recognition.start();
            } catch (e) {
                console.error(e);
            }
        }
    }

    function updateMicUI() {
        if (state.isRecording) {
            elements.micBtn.parentElement.classList.add('mic-recording');
            elements.micStatus.textContent = '録音中...（もう一度タップで停止）';
            elements.micStatus.classList.add('text-orange-500', 'font-bold');
        } else {
            elements.micBtn.parentElement.classList.remove('mic-recording');
            elements.micStatus.textContent = 'タップして話す';
            elements.micStatus.classList.remove('text-orange-500', 'font-bold');
        }
    }

    function openSettings() {
        elements.apiKeyInput.value = state.apiKey;
        elements.settingsModal.classList.remove('hidden');
        // trigger reflow for transition
        void elements.settingsModal.offsetWidth;
        elements.settingsModal.classList.add('show');
    }

    function closeSettings() {
        elements.settingsModal.classList.remove('show');
        setTimeout(() => {
            elements.settingsModal.classList.add('hidden');
        }, 300); // Matches Tailwind duration-300
    }

    function saveApiKey() {
        const key = elements.apiKeyInput.value.trim();
        if (key) {
            localStorage.setItem('gemini_api_key', key);
            state.apiKey = key;
            closeSettings();
            showToast('API Keyを保存しました！');
        } else {
            showToast('API Keyを入力してください');
        }
    }

    function showToast(message, duration = 3000) {
        elements.toast.textContent = message;
        elements.toast.classList.add('show');
        setTimeout(() => {
            elements.toast.classList.remove('show');
        }, duration);
    }

    async function generateRecipe() {
        const ingredients = elements.ingredientsInput.value.trim();
        if (!ingredients) {
            showToast('冷蔵庫にある具材を入力するか、声で教えてください！');
            elements.ingredientsInput.focus();
            return;
        }

        if (!state.selectedMood) {
            showToast('今の気分を選択してください！');
            // Add a small shake animation to mood grid would be nice here
            return;
        }

        if (!state.apiKey) {
            showToast('Gemini API Keyが設定されていません');
            openSettings();
            return;
        }

        // Show loading state
        elements.outputSection.classList.remove('hidden');
        elements.loadingIndicator.classList.remove('hidden');
        elements.loadingIndicator.classList.add('flex');
        elements.recipesContainer.classList.add('hidden');
        elements.generateBtn.disabled = true;

        // Scroll to output gracefully
        setTimeout(() => {
            elements.outputSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);

        try {
            const recipeData = await fetchGeminiRecipe(ingredients, state.selectedMood);
            renderRecipe(recipeData);
        } catch (error) {
            console.error(error);
            showToast(error.message || 'レシピの生成に失敗しました。API Keyや通信状況を確認してください。', 5000);
            elements.outputSection.classList.add('hidden');
        } finally {
            elements.generateBtn.disabled = false;
            elements.loadingIndicator.classList.add('hidden');
            elements.loadingIndicator.classList.remove('flex');
        }
    }

    async function fetchGeminiRecipe(ingredients, mood) {
        const systemPrompt = `あなたは三橋家（代表取締役の三橋泰介、美人妻、5歳の息子の3人家族）の専属AIシェフです。
以下のルールに必ず従って、最高の献立を**必ず3種類**提案してください。

1. 正確性と品質を最重視すること。
2. 5歳の子どもが喜ぶ要素（少し甘めの味付け、食べやすいサイズ感、見た目の楽しさなど）を隠し味や工夫として取り入れること。
3. 指定された具材[${ingredients}]をできるだけ活用し、指定された気分[${mood}]に合致する料理にすること。不足している一般的な調味料や必須食材は適宜補ってよい。
4. Markdownコードブロック(\`\`\`json)などを使わず、**3つの料理データを含む配列（Array）の純粋なJSON文字列のみ**を出力すること。

必須出力JSONフォーマット:
[
  {
    "dishName": "料理のタイトル（食欲をそそる魅力的な名前）",
    "ingredients": ["材料1（分量）", "材料2（分量）", ...],
    "steps": ["手順1", "手順2", "手順3", ...],
    "imagePromptKeywords": "画像生成AI用の単語の羅列（英語）。例: delicious Japanese food, highly detailed, food photography, masterpiece, vibrant colors"
  },
  {
    "dishName": "2つめの料理のタイトル",
    ...
  },
  {
    "dishName": "3つめの料理のタイトル",
    ...
  }
]`;

        const requestBody = {
            contents: [{ parts: [{ text: systemPrompt }] }],
            generationConfig: { temperature: 0.7, responseMimeType: "application/json" }
        };

        // We know gemini-2.5-flash is available for this account based on ListModels
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${state.apiKey}`;
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            let errorMsg = '通信エラーが発生しました。API Keyやネットワークを確認してください。';
            try {
                const errorData = await response.json();
                console.error("Gemini API Error Response:", errorData);
                errorMsg = errorData.error?.message || errorMsg;
                if (errorData.error?.status === 'INVALID_ARGUMENT' || errorData.error?.code === 400) {
                    errorMsg = 'API Keyが無効であるか、形式が間違っています。設定から正しいキーを入力し直してください。（スペースが含まれていないか等）';
                }
            } catch (e) {
                console.error("Could not parse error response", e);
            }
            throw new Error(errorMsg);
        }

        const data = await response.json();
        let textResponse = data.candidates[0].content.parts[0].text;

        // Sanitize response just in case markdown blocks are returned despite responseMimeType
        textResponse = textResponse.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim();

        try {
            // Further sanitize any trailing commas or unescaped characters before parsing
            const cleanText = textResponse.replace(/,\s*([\]}])/g, '$1');
            const parsed = JSON.parse(cleanText);
            return Array.isArray(parsed) ? parsed.slice(0, 3) : [parsed];
        } catch (e) {
            console.error("JSON Parse Error on text: ", textResponse);
            console.error("Error Details:", e);
            alert("AIが不正な形式を返しました。エラー詳細: " + e.message + "\n\n(OKを押して再試行してください)");
            throw new Error('AIが回答の形式を間違えました。もう一度「今夜の夕食を考える！」を押してください。');
        }
    }

    // Generate a recipe-accurate image using Google Imagen 4.0 Fast API
    async function fetchRecipeImage(imagePromptKeywords) {
        const promptAdditions = ", professional food photography, 4k, masterpiece, highly detailed, appetizing, top down shot";
        const fullPrompt = imagePromptKeywords + promptAdditions;

        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-fast-generate-001:predict?key=${state.apiKey}`;
        const requestBody = {
            instances: [{ prompt: fullPrompt }],
            parameters: { sampleCount: 1, aspectRatio: "4:3" }
        };

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            throw new Error('Image generation failed');
        }

        const data = await response.json();
        if (data.predictions && data.predictions[0] && data.predictions[0].bytesBase64Encoded) {
            const mimeType = data.predictions[0].mimeType || 'image/png';
            return `data:${mimeType};base64,${data.predictions[0].bytesBase64Encoded}`;
        }
        throw new Error('No image data in response');
    }

    function renderRecipe(recipes) {
        const container = document.getElementById('recipesContainer');

        // Hide the single old result box if it still exists in DOM state somehow
        const oldResultBox = document.getElementById('resultBox');
        if (oldResultBox) oldResultBox.classList.add('hidden');

        // Clear previous results
        container.innerHTML = '';
        container.classList.remove('hidden');

        recipes.forEach((recipe, index) => {
            const ingredientsHtml = recipe.ingredients.map(ing => `<li>${ing}</li>`).join('');
            const stepsHtml = recipe.steps.map(step => `<li class="pl-1 pb-2 border-b border-gray-100 last:border-0"><span class="leading-relaxed">${step}</span></li>`).join('');

            const cardHtml = `
                <div class="recipe-card bg-white rounded-2xl shadow-xl overflow-hidden border border-orange-50 mb-8">
                    <div class="relative w-full h-64 bg-gray-100 flex items-center justify-center overflow-hidden group">
                        <img class="recipeImage w-full h-full object-cover hidden transition-all duration-700 opacity-0 group-hover:scale-105" src="" alt="Recipe Image">
                        <div class="imageLoading absolute inset-0 flex flex-col items-center justify-center text-gray-400 gap-2">
                            <i class="fas fa-camera text-4xl mb-2 animate-pulse text-orange-200"></i>
                            <span class="text-xs font-medium text-gray-400">AIが料理写真を生成中...</span>
                        </div>
                        <div class="absolute top-4 left-4 bg-orange-500 text-white font-bold py-1 px-3 rounded-full shadow-md text-sm">
                            候補 ${index + 1}
                        </div>
                    </div>
                    <div class="p-6 flex flex-col gap-6">
                        <h2 class="text-2xl font-bold text-gray-800 leading-tight">${recipe.dishName}</h2>
                        <div class="bg-orange-50/50 rounded-xl p-4">
                            <h3 class="flex items-center gap-2 text-orange-600 font-bold mb-3">
                                <i class="fas fa-shopping-basket"></i> 材料
                            </h3>
                            <ul class="list-disc list-inside text-gray-700 text-sm flex flex-col gap-2 pl-1 marker:text-orange-400">
                                ${ingredientsHtml}
                            </ul>
                        </div>
                        <div class="px-2">
                            <h3 class="flex items-center gap-2 text-orange-600 font-bold mb-3">
                                <i class="fas fa-list-ol"></i> 手順
                            </h3>
                            <ol class="list-decimal list-outside text-gray-700 text-sm flex flex-col gap-4 pl-5 marker:font-bold marker:text-orange-400">
                                ${stepsHtml}
                            </ol>
                        </div>
                    </div>
                </div>
            `;

            // Append HTML as a new div wrapper
            const wrapper = document.createElement('div');
            wrapper.className = 'w-full';
            wrapper.innerHTML = cardHtml;
            container.appendChild(wrapper);

            // Handle Image loading visually using Imagen 4.0 Fast API
            const newCard = container.lastElementChild;
            const recipeImageElem = newCard.querySelector('.recipeImage');
            const imageLoadingElem = newCard.querySelector('.imageLoading');

            // Fire off the Imagen API call asynchronously for each card
            fetchRecipeImage(recipe.imagePromptKeywords)
                .then(dataUrl => {
                    recipeImageElem.src = dataUrl;
                    imageLoadingElem.classList.add('hidden');
                    recipeImageElem.classList.remove('hidden');
                    void recipeImageElem.offsetWidth;
                    recipeImageElem.classList.remove('opacity-0');
                    recipeImageElem.classList.add('opacity-100');
                })
                .catch(err => {
                    console.error('Image generation error:', err);
                    imageLoadingElem.innerHTML = '<span class="text-xs text-red-400">画像の生成に失敗しました</span>';
                });
        });
    }
});

