import { Translator } from './translate.js';

// 声明一个变量来存储ImageGenerator类
let ImageGenerator;

// 在文件开头添加加载ImageGenerator的函数
async function loadImageGenerator() {
  const module = await import(chrome.runtime.getURL('imageGenerator.js'));
  ImageGenerator = module.ImageGenerator;
}

// 修改配置初始化
const DEFAULT_CONFIG = {
  question: {
    backgroundColor: '#ffffff',
    titleColor: '#333333',
    textColor: '#666666',
    titleFontFamily: 'Arial, sans-serif',
    contentFontFamily: 'Arial, sans-serif',
    titleFontSize: 50,
    titleLineHeight: 1.4,
    titleLetterSpacing: 0,
    titleAreaSpacing: 60,
    contentFontSize: 32,
    contentLineHeight: 1.8,
    contentLetterSpacing: 0,
    contentAreaSpacing: 40,
  },
  answer: {
    backgroundColor: '#ffffff',
    textColor: '#666666',
    contentFontFamily: 'Arial, sans-serif',
    answerContentFontSize: 32,
    answerContentLineHeight: 1.8,
    answerContentLetterSpacing: 0,
    answerAuthorFontSize: 42,
    answerAuthorSpacing: 64,
    authorContentSpacing: 40,
    comments: []
  }
};

// 修改currentConfig初始化
let currentConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));

let translator = null;
let previewType = 'question';

// 初置
async function initializeConfig() {
  const result = await chrome.storage.local.get('config');
  if (result.config) {
    currentConfig = result.config;
  } else {
    currentConfig = { ...DEFAULT_CONFIG };
  }
}

// 保存配置
async function saveConfig() {
  await chrome.storage.local.set({ config: currentConfig });
}

let currentWorker = null; // 用于跟踪当前Worker

// 修改状态管理
let states = {
  question: {
    generating: false,
    imageDataUrl: null,
    content: null
  },
  answer: {
    generating: false,
    imageDataUrl: null,
    content: null,
    currentCommentIndex: 0,
    commentImages: []
  }
};

// 修改预览切换逻辑
document.querySelectorAll('.preview-tab').forEach(tab => {
  tab.addEventListener('click', async (e) => {
    // 更新激活状态
    document.querySelectorAll('.preview-tab').forEach(t => t.classList.remove('active'));
    e.target.classList.add('active');
    
    // 更新预览类型
    previewType = e.target.dataset.type;
    
    // 切换预览区域显示
    document.querySelectorAll('.preview-section').forEach(section => {
      section.classList.toggle('active', section.id === `${previewType}-preview`);
    });

    // 切换工具栏显示
    document.querySelector('.question-toolbar').style.display = 
      previewType === 'question' ? 'flex' : 'none';
    document.querySelector('.answer-toolbar').style.display = 
      previewType === 'answer' ? 'flex' : 'none';

    // 获取当前状态
    const currentState = states[previewType];
    
    // 如果当前类型有内容
    if (currentState.content) {
      // 如果已有预览图片，直接显示
      if (currentState.imageDataUrl) {
        const previewElement = document.getElementById(`${previewType}-preview`).querySelector('.preview');
        const downloadButton = document.getElementById(`${previewType}-download`);
        previewElement.innerHTML = `<img src="${currentState.imageDataUrl}" style="max-width: 100%;">`;
        downloadButton.style.display = 'block';
      } else {
        // 否则生成新的预览
        await updatePreview();
      }
    }

    // 更新编辑器值以反映当前模式的配置
    updateEditorValues();
  });
});

// 在文件开头定义全局Worker
let globalWorker = null;

// 创Worker的函数
function getWorker() {
  if (!globalWorker) {
    globalWorker = new Worker(chrome.runtime.getURL('imageWorker.js'));
  }
  return globalWorker;
}

// 问题预览相关
const questionPreview = {
  async update(content) {
    const previewElement = document.getElementById('question-preview').querySelector('.preview');
    const downloadButton = document.getElementById('question-download');
    
    if (!content) {
      previewElement.innerHTML = '<p>请先点击转换按钮获取内容</p>';
      return;
    }

    try {
      const worker = getWorker();
      const imageData = await generatePreviewImage(worker, content, 'question');
      
      states.question.imageDataUrl = imageData;
      previewElement.innerHTML = `<img src="${imageData}" style="max-width: 100%;">`;
      downloadButton.style.display = 'block';
    } catch (error) {
      handlePreviewError(previewElement, error);
    }
  }
};

// 回答预览相关
const answerPreview = {
  async update(content) {
    const previewElement = document.getElementById('answer-preview').querySelector('.preview');
    const downloadButton = document.getElementById('answer-download');
    
    if (!content) {
      previewElement.innerHTML = '<p>请先点击转换按钮获取内容</p>';
      return;
    }

    try {
      const worker = getWorker();
      const imageData = await generatePreviewImage(worker, content, 'answer');
      
      states.answer.imageDataUrl = imageData;
      previewElement.innerHTML = `<img src="${imageData}" style="max-width: 100%;">`;
      downloadButton.style.display = 'block';
    } catch (error) {
      handlePreviewError(previewElement, error);
    }
  }
};

// 共用的工具函数
async function generatePreviewImage(worker, content, type) {
  // 确保内容不为空
  if (!content) {
    throw new Error('No content to generate preview');
  }

  // 确保标题存在
  if (type === 'question' && !content.title) {
    throw new Error('Question content must have a title');
  }

  return new Promise((resolve, reject) => {
    worker.onmessage = (e) => {
      if (e.data.success) {
        resolve(e.data.imageData);
      } else {
        reject(new Error(e.data.error));
      }
    };

    // 添加日志
    console.log('Sending to worker:', {
      content,
      config: currentConfig[type],
      previewType: type
    });

    worker.postMessage({
      content,
      config: currentConfig[type],
      previewType: type
    });
  });
}

function handlePreviewError(element, error) {
  element.innerHTML = `
    <div style="text-align: center; padding: 20px;">
      <p style="color: red;">预览生成失败</p>
      <p style="font-size: 14px;">错误: ${error.message}</p>
    </div>
  `;
}

// 添加消息监听器
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'previewGenerated') {
    // 更新预览显示
    const preview = document.getElementById('preview');
    if (preview) {
      preview.innerHTML = `<img src="${message.imageDataUrl}" style="max-width: 100%;">`;
      document.getElementById('download').style.display = 'block';
    }
  } else if (message.action === 'previewError') {
    // 显示错误
    const preview = document.getElementById('preview');
    if (preview) {
      preview.innerHTML = `
        <div style="text-align: center; padding: 20px;">
          <p style="color: red;">预览生成失败</p>
          <p style="font-size: 14px;">错误: ${message.error}</p>
        </div>
      `;
    }
  }
});

// 添加缓存相关函数
async function getCacheKey() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab.url;
}

async function getCache() {
  const url = await getCacheKey();
  const result = await chrome.storage.local.get(url);
  return result[url];
}

async function saveCache(data) {
  const url = await getCacheKey();
  await chrome.storage.local.set({
    [url]: {
      timestamp: Date.now(),
      translatedData: data
    }
  });
}

// 修改extractContent函数，添加forceUpdate参数
async function extractContent(forceUpdate = false) {
  try {
    // 先检查缓存，但如果是强制更新则
    const cache = await getCache();
    if (cache && !forceUpdate) {
      console.log('Using cached data');
      states.question.content = cache.translatedData;
      states.answer.content = {
        comments: cache.translatedData.comments,
        subreddit: cache.translatedData.subreddit,
        subredditIcon: cache.translatedData.subredditIcon,
        isAnswer: true
      };
      await updatePreview();
      return;
    }

    // 获取当前标签页
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // 查是否在Reddit页面
    if (!tab.url.includes('reddit.com')) {
      throw new Error('请在Reddit帖子页面使用插件');
    }

    const previewElement = document.getElementById(`${previewType}-preview`).querySelector('.preview');
    previewElement.innerHTML = '<p>正在提取内容...</p>';

    // 注入content script
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
    } catch (error) {
      console.log('Content script may already be injected:', error);
    }

    // 等待一小段时间确保content script加载完成
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // 发送息给content script
    const response = await chrome.tabs.sendMessage(tab.id, { action: "extract" })
      .catch(error => {
        console.error('Send message failed:', error);
        throw new Error('无法与页面通信，请刷新页面后重试');
      });
    
    if (!response) {
      throw new Error('未收到页面响应，请刷新页面后重试');
    }

    if (response.error) {
      throw new Error(response.error);
    }

    try {
      if (!translator) {
        throw new Error('翻译未初始化，请设置API Key');
      }

      previewElement.innerHTML = '<p>正在翻译内容...</p>';
      
      // 译内容
      const translatedData = { ...response };
      translatedData.translatedTitle = await translator.translate(response.title, true);
      
      if (response.content.length > 0) {
        const contentText = response.content.join('\n\n');
        translatedData.translatedContent = await translator.translate(contentText, false);
        console.log('Translated content:', translatedData.translatedContent);
      }

      if (response.comments.length > 0) {
        translatedData.comments = await Promise.all(
          response.comments.map(async comment => {
            const translated = await translator.translate(comment.content, false);
            console.log('Translated comment:', translated);
            return {
              ...comment,
              translatedContent: translated
            };
          })
        );
      }

      // 在更新状态前打印日志
      console.log('Final translated data:', translatedData);

      // 保存转换结果到缓存
      await saveCache(translatedData);
      
      // 同时更新两种预览模式的content
      states.question.content = translatedData;
      states.answer.content = {
        comments: translatedData.comments,
        subreddit: translatedData.subreddit,
        subredditIcon: translatedData.subredditIcon,
        isAnswer: true
      };
      
      // 只更新当前预览显示
      await updatePreview();
      
    } catch (error) {
      console.error('Translation failed:', error);
      throw new Error(`翻译失败: ${error.message}`);
    }
  } catch (error) {
    console.error('Content extraction failed:', error);
    const previewElement = document.getElementById(`${previewType}-preview`).querySelector('.preview');
    previewElement.innerHTML = `
      <div style="text-align: center; padding: 20px;">
        <p style="color: red;">内容提取失败</p>
        <p style="font-size: 14px;">原因: ${error.message}</p>
        <p style="font-size: 12px; margin-top: 8px;">提示：请刷新页面后试</p>
      </div>
    `;
  }
}

// 下载图片
async function downloadImage(type) {
  if (type === 'answer') {
    // 使用 states.answer.commentImages 替代 answerImages
    const images = states.answer.commentImages;
    const currentIndex = states.answer.currentCommentIndex;
    
    // 只下载当前预的评论图片
    if (images && images[currentIndex]) {
      const link = document.createElement('a');
      link.href = images[currentIndex];
      link.download = `reddit-to-xiaohongshu-answer-${currentIndex + 1}-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      // 如果前评论图片不存在，尝试下载当前预览的图片
      const currentImage = states.answer.imageDataUrl;
      if (currentImage) {
        const link = document.createElement('a');
        link.href = currentImage;
        link.download = `reddit-to-xiaohongshu-answer-${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    }
  } else {
    // 问题模的下辑保不变
    const state = states[type];
    if (state.imageDataUrl) {
      const link = document.createElement('a');
      link.href = state.imageDataUrl;
      link.download = `reddit-to-xiaohongshu-${type}-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  }
}

// 将 rangeInputs 定义移到全局作用域
const rangeInputs = {
  // 问题模式的设置
  titleFontSize: { suffix: 'px', configKey: 'question' },
  titleLetterSpacing: { suffix: 'px', configKey: 'question' },
  titleLineHeight: { suffix: '', configKey: 'question' },
  titleAreaSpacing: { suffix: 'px', configKey: 'question' },
  contentFontSize: { suffix: 'px', configKey: 'question' },
  contentLetterSpacing: { suffix: 'px', configKey: 'question' },
  contentLineHeight: { suffix: '', configKey: 'question' },
  
  // 回答模式的设置 - 作者相关
  answerAuthorFontSize: { suffix: 'px', configKey: 'answer', updateType: 'comment' },
  answerAuthorSpacing: { suffix: 'px', configKey: 'answer', updateType: 'comment' },  // 作者名和顶部容器的间距
  authorContentSpacing: { suffix: 'px', configKey: 'answer', updateType: 'comment' },  // 作者名和正文的间距
  
  // 回答模式的设置 - 正文相关
  answerContentFontFamily: { configKey: 'answer', updateType: 'comment' },  // 添加字体配置
  answerContentFontSize: { suffix: 'px', configKey: 'answer', updateType: 'comment' },
  answerContentLetterSpacing: { suffix: 'px', configKey: 'answer', updateType: 'comment' },
  answerContentLineHeight: { suffix: '', configKey: 'answer', updateType: 'comment' }
};

// 初始化编辑器工具栏
function initializeEditorToolbar() {
  console.log('Starting to initialize editor toolbar...'); // 初始化开始日志

  try {
    const editorButtons = document.querySelectorAll('.editor-button');
    console.log('Found editor buttons:', {
      count: editorButtons.length,
      buttons: Array.from(editorButtons).map(btn => ({
        text: btn.textContent.trim(),
        hasDropdown: !!btn.querySelector('.editor-dropdown')
      }))
    });

    if (editorButtons.length === 0) {
      console.warn('No editor buttons found! DOM might not be ready.');
      return;
    }

    // 保持现有的按钮点击事件处理
    editorButtons.forEach((button, index) => {
      console.log(`Setting up button ${index}:`, {
        text: button.textContent.trim(),
        hasDropdown: !!button.querySelector('.editor-dropdown')
      });

      button.addEventListener('click', (e) => {
        console.log('Button clicked:', {
          buttonText: button.textContent.trim(),
          wasActive: button.classList.contains('active'),
          event: e.type
        });

        e.stopPropagation();
        
        const wasActive = button.classList.contains('active');
        button.classList.toggle('active');
        console.log('Button state toggled:', {
          buttonText: button.textContent.trim(),
          nowActive: button.classList.contains('active')
        });
        
        editorButtons.forEach(otherButton => {
          if (otherButton !== button && otherButton.classList.contains('active')) {
            console.log('Closing other button:', otherButton.textContent.trim());
            otherButton.classList.remove('active');
          }
        });
      });
    });

    // 添加数字输入框和滑块的双向绑定
    document.querySelectorAll('.number-input').forEach(input => {
      const targetId = input.dataset.target;
      const rangeInput = document.getElementById(targetId);
      const valueSpan = document.getElementById(`${targetId}Value`);
      const config = rangeInputs[targetId];
      
      console.log('Setting up number input:', { targetId, config });
      
      // 监听数字输入框变化
      input.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        if (!isNaN(value) && value >= parseFloat(input.min) && value <= parseFloat(input.max)) {
          console.log('Number input changed:', { targetId, value });
          
          // 更新滑块值
          rangeInput.value = value;
          valueSpan.textContent = value + (config.suffix || '');
          
          // 更新配置
          if (previewType === 'answer' && config.updateType === 'comment') {
            const currentIndex = states.answer.currentCommentIndex || 0;
            if (!currentConfig.answer.comments[currentIndex]) {
              currentConfig.answer.comments[currentIndex] = { ...DEFAULT_CONFIG };
            }
            currentConfig.answer.comments[currentIndex][targetId] = value;
            updateCommentPreview();
          } else {
            currentConfig[previewType][targetId] = value;
            updatePreview();
          }
          
          saveConfig();
        }
      });
    });

    // 滑块事件监听
    Object.entries(rangeInputs).forEach(([id, config]) => {
      const input = document.getElementById(id);
      const valueSpan = document.getElementById(id + 'Value');
      const numberInput = document.querySelector(`[data-target="${id}"]`);
      
      console.log('Setting up range input:', { id, config });
      
      if (input && valueSpan) {
        input.addEventListener('input', (e) => {
          const value = parseFloat(e.target.value);
          console.log('Range input changed:', { id, value });
          
          valueSpan.textContent = value + (config.suffix || '');
          if (numberInput) {
            numberInput.value = value;
          }
          
          if (previewType === 'answer' && config.updateType === 'comment') {
            const currentIndex = states.answer.currentCommentIndex || 0;
            if (!currentConfig.answer.comments[currentIndex]) {
              currentConfig.answer.comments[currentIndex] = { ...DEFAULT_CONFIG };
            }
            currentConfig.answer.comments[currentIndex][id] = value;
            updateCommentPreview();
          } else {
            currentConfig[previewType][id] = value;
            updatePreview();
          }
          
          saveConfig();
        });
      }
    });

    // 点击其他地方关闭所有下拉菜单
    document.addEventListener('click', (e) => {
      console.log('Document clicked, target:', e.target.tagName, e.target.className);
      
      if (!e.target.closest('.editor-button')) {
        console.log('Closing all dropdowns due to outside click');
        editorButtons.forEach(button => {
          if (button.classList.contains('active')) {
            console.log('Closing dropdown for:', button.textContent.trim());
            button.classList.remove('active');
          }
        });
      }
    });

    // 阻止下拉菜单内部点击关闭
    document.querySelectorAll('.editor-dropdown').forEach(dropdown => {
      console.log('Setting up dropdown prevention for:', dropdown);
      dropdown.addEventListener('click', (e) => {
        console.log('Dropdown clicked, preventing propagation');
        e.stopPropagation();
      });
    });

    console.log('Editor toolbar initialization completed successfully');
  } catch (error) {
    console.error('Error initializing editor toolbar:', error);
  }
}

// 修改下载按钮的事件绑定
function initializeDownloadButtons() {
  const questionDownload = document.getElementById('question-download');
  const answerDownload = document.getElementById('answer-download');

  if (questionDownload) {
    questionDownload.addEventListener('click', () => downloadImage('question'));
  }
  if (answerDownload) {
    answerDownload.addEventListener('click', () => downloadImage('answer'));
  }
}

// 添加预览标签切换功能
function updatePreviewTabs() {
  document.querySelectorAll('.preview-tab').forEach(tab => {
    tab.addEventListener('click', async (e) => {
      // 更新标签状态
      document.querySelectorAll('.preview-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      // 更新预览区域显示
      document.querySelectorAll('.preview-section').forEach(section => {
        section.classList.remove('active');
      });
      
      // 获取预览类型
      const type = tab.dataset.type;
      previewType = type;
      
      // 显示对应的预览区域
      document.getElementById(`${type}-preview`).classList.add('active');
      
      // 更新编辑器值
      updateEditorValues();
      
      // 移除这里的缓存检查，直接重新生成预览
      if (states[type].content) {
        if (type === 'answer') {
          // 回答模式使用 updateCommentPreview
          await updateCommentPreview();
        } else {
          // 问题模式使用 updatePreview
          await updatePreview();
        }
      }
      
      // 果是回答模式且有评论，成评论标签
      if (type === 'answer' && states.answer.content?.comments) {
        generateCommentTabs(states.answer.content.comments);
      }
    });
  });
}

// 加加载所有缓存的函数
async function loadAllCaches() {
  const cache = await getCache();
  if (cache) {
    console.log('Found cached data, loading...');
    
    // 加载问题预览
    if (cache.translatedData) {
      states.question.content = cache.translatedData;
      await updatePreview();
    }

    // 加载回答预览
    if (cache.translatedData.comments) {
      states.answer.content = {
        comments: cache.translatedData.comments,
        subreddit: cache.translatedData.subreddit,
        subredditIcon: cache.translatedData.subredditIcon,
        isAnswer: true
      };
      // 临时保存当前previewType
      const currentType = previewType;
      previewType = 'answer';
      await updatePreview();
      previewType = currentType;
    }

    console.log('Cache loaded successfully');
  }
}

// 修改DOMContentLoaded事件处理
document.addEventListener('DOMContentLoaded', async () => {
  try {
    console.log('DOM Content Loaded, waiting for elements...');
    
    // 确保HTML结构已加载
    await new Promise(resolve => setTimeout(resolve, 100));
    
    await loadImageGenerator();
    
    // 确保配置已初始化
    const stored = await chrome.storage.local.get('config');
    if (stored.config) {
      currentConfig = stored.config;
    } else {
      currentConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
      await chrome.storage.local.set({ config: currentConfig });
    }

    // 初始化编辑器工具栏
    initializeEditorToolbar();
    
    // 初始化浮动编辑框
    initializeFloatingEditor();
    
    // 设置默认预览类型
    previewType = 'question';
    
    // 检查API key
    const apiKeyResult = await chrome.storage.local.get('doubanApiKey');
    if (apiKeyResult.doubanApiKey) {
      translator = new Translator(apiKeyResult.doubanApiKey);
      console.log('Translator initialized');
      
      updatePreviewTabs();
      await loadAllCaches();
      
      // 绑定转换按钮
      const convertButton = document.getElementById('convert');
      if (convertButton) {
        convertButton.addEventListener('click', () => extractContent(true));
      }

      initializeDownloadButtons();
    }

    console.log('Popup initialized successfully');
  } catch (error) {
    console.error('Initialization error:', error);
  }
});

// 在插件关闭时处理Worker
window.addEventListener('unload', () => {
  if (globalWorker) {
    globalWorker.terminate();
    globalWorker = null;
  }
});

// 修改updatePreview数支持多图预览
async function updatePreview() {
  try {
    const currentState = states[previewType];
    const previewElement = document.getElementById(`${previewType}-preview`).querySelector('.preview');
    const downloadButton = document.getElementById(`${previewType}-download`);

    if (!currentState.content) {
      previewElement.innerHTML = '<p>请先点击转换按钮获取内容</p>';
      return;
    }

    // 确保使用翻译后的内容
    const contentToUse = {
      ...currentState.content,
      title: currentState.content.translatedTitle || currentState.content.title,
      content: currentState.content.translatedContent || currentState.content.content
    };

    console.log('Updating preview with translated content:', contentToUse);

    const worker = getWorker();
    return new Promise((resolve, reject) => {
      worker.onmessage = async function(e) {
        try {
          if (e.data.success) {
            currentState.imageDataUrl = e.data.imageData;
            currentState.generating = false;
            previewElement.innerHTML = `<img src="${e.data.imageData}" style="max-width: 100%;">`;
            downloadButton.style.display = 'block';
            resolve();
          } else {
            throw new Error(e.data.error);
          }
        } catch (error) {
          reject(error);
        }
      };

      worker.postMessage({
        content: contentToUse,
        config: currentConfig[previewType],
        previewType: previewType
      });
    });
  } catch (error) {
    console.error('Error in updatePreview:', error);
    const previewElement = document.getElementById(`${previewType}-preview`).querySelector('.preview');
    previewElement.innerHTML = `
      <div style="text-align: center; padding: 20px;">
        <p style="color: red;">预览生成失败</p>
        <p style="font-size: 14px;">错误: ${error.message}</p>
      </div>
    `;
  }
}

// 添加保存API Key的功能
document.getElementById('saveApiKey')?.addEventListener('click', async () => {
  const apiKey = document.getElementById('apiKey').value;
  if (!apiKey) {
    alert('请输入API Key');
    return;
  }
  
  try {
    await chrome.storage.local.set({ 'doubanApiKey': apiKey });
    translator = new Translator(apiKey);
    alert('API Key 保存成功');
  } catch (error) {
    alert('保存失败：' + error.message);
  }
});

// 加生评论标签函数
function generateCommentTabs(comments) {
  // 确保comments配置数组存在
  if (!currentConfig.answer.comments) {
    currentConfig.answer.comments = [];
  }
  
  // 为每个评论创建默认配置
  comments.forEach((_, index) => {
    if (!currentConfig.answer.comments[index]) {
      currentConfig.answer.comments[index] = {
        answerContentFontSize: currentConfig.answer.answerContentFontSize,
        answerContentLineHeight: currentConfig.answer.answerContentLineHeight,
        answerContentLetterSpacing: currentConfig.answer.answerContentLetterSpacing,
        answerAuthorFontSize: currentConfig.answer.answerAuthorFontSize,
        answerAuthorSpacing: currentConfig.answer.answerAuthorSpacing,
        authorContentSpacing: currentConfig.answer.authorContentSpacing
      };
    }
  });

  const tabsContainer = document.querySelector('.comment-tabs');
  tabsContainer.innerHTML = comments.map((comment, index) => `
    <button class="comment-tab ${index === 0 ? 'active' : ''}" data-index="${index}">
      评论 ${index + 1}
    </button>
  `).join('');

  // 添加标签切换件
  tabsContainer.querySelectorAll('.comment-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      // 更新标签激活状态
      tabsContainer.querySelectorAll('.comment-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      // 更新当前评论索引
      states.answer.currentCommentIndex = parseInt(tab.dataset.index);
      
      // 更新编辑器值以反映当前评论的配置
      updateCommentEditorValues(states.answer.currentCommentIndex);
      
      // 更新预览显示
      updateCommentPreview();
    });
  });
}

// 添加新函数更新评论编辑器的值
function updateCommentEditorValues(commentIndex) {
  // 确保comments数组存在
  if (!currentConfig.answer.comments) {
    currentConfig.answer.comments = [];
  }
  
  // 确保当前评论索引的配置存在
  if (!currentConfig.answer.comments[commentIndex]) {
    currentConfig.answer.comments[commentIndex] = {
      answerContentFontSize: currentConfig.answer.answerContentFontSize || 32,
      answerContentLineHeight: currentConfig.answer.answerContentLineHeight || 1.8,
      answerContentLetterSpacing: currentConfig.answer.answerContentLetterSpacing || 0,
      answerAuthorFontSize: currentConfig.answer.answerAuthorFontSize || 42,
      answerAuthorSpacing: currentConfig.answer.answerAuthorSpacing || 64,
      authorContentSpacing: currentConfig.answer.authorContentSpacing || 40
    };
  }

  // 更新评论相关的滑块值
  Object.entries(rangeInputs).forEach(([id, config]) => {
    if (config.updateType === 'comment') {
      const input = document.getElementById(id);
      const valueSpan = document.getElementById(id + 'Value');
      if (input && valueSpan) {
        const value = currentConfig.answer.comments[commentIndex][id] || 
                     currentConfig.answer[id];
        input.value = value;
        valueSpan.textContent = value + (config.suffix || '');
      }
    }
  });

  // 更新字体选择器
  const fontSelect = document.getElementById('answerContentFontFamily');
  if (fontSelect) {
    fontSelect.value = currentConfig.answer.comments[commentIndex].answerContentFontFamily || 
                      currentConfig.answer.contentFontFamily;
  }
}

// 添加更新评论预览的函数
async function updateCommentPreview() {
  const currentState = states.answer;
  const previewElement = document.getElementById('answer-preview').querySelector('.preview');
  const index = currentState.currentCommentIndex;

  if (!currentState.content || !currentState.content.comments) {
    previewElement.innerHTML = '<p>请先点击转换按钮获取内容</p>';
    return;
  }

  try {
    const comment = currentState.content.comments[index];
    // 确保评论内容是数组形式
    const content = Array.isArray(comment.translatedContent) ? 
      comment.translatedContent : 
      [comment.translatedContent];

    const messageData = {
      content: {
        subreddit: currentState.content.subreddit,
        subredditIcon: currentState.content.subredditIcon,
        comments: [{
          author: comment.author,
          content: content,
          score: comment.score
        }],
        isAnswer: true
      },
      config: {
        ...currentConfig.answer,
        ...(currentConfig.answer.comments[index] || {})
      },
      previewType: 'answer'
    };

    const worker = getWorker();
    
    console.log('Sending data to worker:', messageData);
    worker.postMessage(messageData);

    // 使用 Promise 等待 worker 响应
    const imageData = await new Promise((resolve, reject) => {
      worker.onmessage = (e) => {
        console.log('Received worker response:', e.data);
        if (e.data.success) {
          resolve(e.data.imageData);
        } else {
          reject(new Error(e.data.error));
        }
      };
    });

    // 更新图片源
    const previewImg = previewElement.querySelector('img');
    if (!previewImg) {
      // 如果没有图片元素，创建一个新的
      previewElement.innerHTML = '<img style="max-width: 100%;">';
      previewImg = previewElement.querySelector('img');
    }
    previewImg.src = imageData;
    
    // 更新缓存
    currentState.commentImages[index] = imageData;

    // 显示下载按钮
    document.getElementById('answer-download').style.display = 'block';
  } catch (error) {
    console.error('Error in updateCommentPreview:', error);
    previewElement.innerHTML = `
      <div style="text-align: center; padding: 20px;">
        <p style="color: red;">预览生成失败</p>
        <p style="font-size: 14px;">错误: ${error.message}</p>
      </div>
    `;
  }
}

function updateEditorUI(content) {
  const hasContent = content && content.content && content.content.length > 0;
  const contentEditorButtons = document.querySelectorAll('.content-editor-button');
  
  contentEditorButtons.forEach(button => {
    button.disabled = !hasContent;
    button.style.opacity = hasContent ? '1' : '0.5';
    if (!hasContent) {
      button.title = '子没有正文内容';
    }
  });
}

// 修改配置应用辑
function getConfig() {
  return previewType === 'question' ? 
    currentConfig.question : 
    currentConfig.answer;
}

function updateEditorValues() {
  if (!currentConfig || !currentConfig[previewType]) {
    console.warn('Config not initialized yet');
    return;
  }

  Object.entries(rangeInputs).forEach(([id, config]) => {
    const input = document.getElementById(id);
    const valueSpan = document.getElementById(id + 'Value');
    if (input && valueSpan && currentConfig[previewType][id] !== undefined) {
      const value = currentConfig[previewType][id] || DEFAULT_CONFIG[previewType][id];
      input.value = value;
      valueSpan.textContent = value + (config.suffix || '');
    }
  });
  
  // 新颜色选择器
  ['backgroundColor', 'titleColor', 'textColor'].forEach(id => {
    const input = document.getElementById(id);
    if (input && currentConfig[previewType][id] !== undefined) {
      input.value = currentConfig[previewType][id] || DEFAULT_CONFIG[previewType][id];
    }
  });
  
  // 更新字体选择器
  ['title', 'content'].forEach(type => {
    const fontSelect = document.getElementById(`${type}FontFamily`);
    if (fontSelect && currentConfig[previewType][`${type}FontFamily`] !== undefined) {
      fontSelect.value = currentConfig[previewType][`${type}FontFamily`] || 
                        DEFAULT_CONFIG[previewType][`${type}FontFamily`];
    }
  });
}

// 在 popup.js 中添加调试函数
function debugStates() {
  console.log('=== Debug States ===');
  console.log('Current State:', states);
  console.log('Answer Content:', states.answer.content);
  console.log('Subreddit Icon:', states.answer.content?.subredditIcon);
  
  // 测试图片加载
  if (states.answer.content?.subredditIcon) {
    console.log('Testing image load for:', states.answer.content.subredditIcon);
    fetch(states.answer.content.subredditIcon)
      .then(response => response.blob())
      .then(blob => createImageBitmap(blob))
      .then(bitmap => {
        console.log('Image loaded successfully:', bitmap);
      })
      .catch(error => {
        console.error('Failed to load image:', error);
      });
  }

  // 打印发送给 worker 的数据结构
  if (states.answer.content) {
    const currentIndex = states.answer.currentCommentIndex || 0;
    const comment = states.answer.content.comments[currentIndex];
    
    const workerData = {
      content: {
        subreddit: states.answer.content.subreddit,
        subredditIcon: states.answer.content.subredditIcon,
        comments: [{
          author: comment.author,
          content: comment.translatedContent,
          score: comment.score
        }],
        isAnswer: true
      },
      config: {
        ...currentConfig.answer,
        ...currentConfig.answer.comments[currentIndex]
      },
      previewType: 'answer'
    };
    
    console.log('Worker Data:', workerData);
  }
}

// 修改事件绑定方式，使用事件委托
function initializeEditFeature() {
  // 添加错误处理和日志
  try {
    const previewContainer = document.querySelector('.preview-container');
    const closeEditButton = document.querySelector('.close-edit');
    
    // 检查元素是否存在
    if (!previewContainer) {
      console.error('Preview container not found');
      return;
    }

    if (!closeEditButton) {
      console.error('Close edit button not found');
      return;
    }

    // 添加事件监听
    previewContainer.addEventListener('click', function(e) {
      if (e.target.tagName === 'IMG' && e.target.closest('.preview')) {
        console.log('Preview image clicked');
        showEditPanel();
      }
    });

    closeEditButton.addEventListener('click', function(e) {
      console.log('Close button clicked');
      e.stopPropagation();
      hideEditPanel();
    });

    console.log('Edit feature initialized successfully');
  } catch (error) {
    console.error('Error initializing edit feature:', error);
  }
}

// 显示编辑面板
function showEditPanel() {
  console.log('Showing edit panel'); // 添加调试日志
  const currentState = states[previewType];
  const editPanel = document.querySelector('.edit-panel');
  const editor = document.querySelector('.content-editor');
  
  if (!currentState || !currentState.content) {
    console.warn('No content to edit');
    return;
  }
  
  if (previewType === 'question') {
    // 问题模式
    editor.value = currentState.content.translatedTitle || currentState.content.title;
  } else {
    // 回答模式
    const currentComment = currentState.content.comments[currentState.currentCommentIndex];
    if (currentComment) {
      editor.value = Array.isArray(currentComment.translatedContent) ? 
        currentComment.translatedContent.join('\n\n') : 
        currentComment.translatedContent;
    }
  }
  
  editPanel.style.display = 'block';
}

// 隐藏编辑面板
function hideEditPanel() {
  console.log('Hiding edit panel'); // 添加调试日志
  document.querySelector('.edit-panel').style.display = 'none';
}

// 保存编辑内容
async function saveEdit() {
  console.log('Saving edit');
  const newContent = textarea.value;
  const currentState = states[previewType];
  
  try {
    // 更新states中的内容,保持完整的数据结构
    if (previewType === 'question') {
      // 保持原始title,只更新translatedTitle
      currentState.content = {
        ...currentState.content,
        translatedTitle: newContent
      };
    } else {
      const currentComment = currentState.content.comments[currentState.currentCommentIndex];
      // 保持原始content,只更新translatedContent
      currentComment.translatedContent = newContent.split('\n\n');
      currentState.content.comments[currentState.currentCommentIndex] = {
        ...currentComment
      };
    }

    // 更新storage中的缓存
    const url = await getCacheKey();
    const cache = await getCache();
    if (cache) {
      if (previewType === 'question') {
        // 保持完整的数据结构
        cache.translatedData = {
          ...cache.translatedData,
          translatedTitle: newContent
        };
      } else {
        const currentComment = cache.translatedData.comments[currentState.currentCommentIndex];
        currentComment.translatedContent = newContent.split('\n\n');
        cache.translatedData.comments[currentState.currentCommentIndex] = {
          ...currentComment
        };
      }
      await chrome.storage.local.set({
        [url]: {
          timestamp: Date.now(),
          translatedData: cache.translatedData
        }
      });
      console.log('Cache updated with full data structure:', cache.translatedData);
    }
    
    hideFloatingEditor();
    
    // 强制重新生成预览
    if (previewType === 'answer') {
      await updateCommentPreview();
    } else {
      await updatePreview();
    }
    
    console.log('Edit saved and preview updated with state:', currentState);
  } catch (error) {
    console.error('Error saving edit:', error);
    alert('保存失败，请重试');
  }
}

function debugEditFeature() {
  console.log('Debug Edit Feature:');
  console.log('Preview container:', document.querySelector('.preview-container'));
  console.log('Edit panel:', document.querySelector('.edit-panel'));
  console.log('Current state:', states[previewType]);
  console.log('Preview type:', previewType);
}

// 添加浮动编辑框功能
function initializeFloatingEditor() {
  console.log('Initializing floating editor...');
  
  const previewContainer = document.querySelector('.preview-container');
  const floatingEditor = document.querySelector('.floating-editor');
  const editorOverlay = document.querySelector('.editor-overlay');
  const textarea = floatingEditor.querySelector('.edit-content');
  const saveButton = floatingEditor.querySelector('.save-edit');
  const cancelButton = floatingEditor.querySelector('.cancel-edit');
  const closeButton = floatingEditor.querySelector('.close-floating-editor');

  // 存储原始内容用于取消编辑
  let originalContent = '';

  // 双击预览图片时显示编辑框
  previewContainer.addEventListener('dblclick', (e) => {
    if (e.target.tagName === 'IMG' && e.target.closest('.preview')) {
      console.log('Preview image double-clicked');
      showFloatingEditor();
    }
  });

  // 显示编辑框
  function showFloatingEditor() {
    console.log('Showing floating editor');
    const currentState = states[previewType];
    
    // 获取当前内容
    if (previewType === 'question') {
      originalContent = currentState.content.translatedTitle || currentState.content.title;
    } else {
      const currentComment = currentState.content.comments[currentState.currentCommentIndex];
      originalContent = Array.isArray(currentComment.translatedContent) ? 
        currentComment.translatedContent.join('\n\n') : 
        currentComment.translatedContent;
    }
    
    textarea.value = originalContent;
    floatingEditor.style.display = 'block';
    editorOverlay.style.display = 'block';
    textarea.focus();
  }

  // 隐藏编辑框
  function hideFloatingEditor() {
    console.log('Hiding floating editor');
    floatingEditor.style.display = 'none';
    editorOverlay.style.display = 'none';
    textarea.value = '';
  }

  // 保存编辑内容
  async function saveEdit() {
    console.log('Saving edit');
    const newContent = textarea.value;
    const currentState = states[previewType];
    
    try {
      // 更新states中的内容,保持完整的数据结构
      if (previewType === 'question') {
        // 保持原始title,只更新translatedTitle
        currentState.content = {
          ...currentState.content,
          translatedTitle: newContent
        };
      } else {
        const currentComment = currentState.content.comments[currentState.currentCommentIndex];
        // 保持原始content,只更新translatedContent
        currentComment.translatedContent = newContent.split('\n\n');
        currentState.content.comments[currentState.currentCommentIndex] = {
          ...currentComment
        };
      }

      // 更新storage中的缓存
      const url = await getCacheKey();
      const cache = await getCache();
      if (cache) {
        if (previewType === 'question') {
          // 保持完整的数据结构
          cache.translatedData = {
            ...cache.translatedData,
            translatedTitle: newContent
          };
        } else {
          const currentComment = cache.translatedData.comments[currentState.currentCommentIndex];
          currentComment.translatedContent = newContent.split('\n\n');
          cache.translatedData.comments[currentState.currentCommentIndex] = {
            ...currentComment
          };
        }
        await chrome.storage.local.set({
          [url]: {
            timestamp: Date.now(),
            translatedData: cache.translatedData
          }
        });
        console.log('Cache updated with full data structure:', cache.translatedData);
      }
      
      hideFloatingEditor();
      
      // 强制重新生成预览
      if (previewType === 'answer') {
        await updateCommentPreview();
      } else {
        await updatePreview();
      }
      
      console.log('Edit saved and preview updated with state:', currentState);
    } catch (error) {
      console.error('Error saving edit:', error);
      alert('保存失败，请重试');
    }
  }

  // 取消编辑
  function cancelEdit() {
    console.log('Canceling edit');
    hideFloatingEditor();
  }

  // 绑定按钮事件
  saveButton.addEventListener('click', saveEdit);
  cancelButton.addEventListener('click', cancelEdit);
  closeButton.addEventListener('click', cancelEdit);

  // 点击遮罩层关闭编辑框
  editorOverlay.addEventListener('click', cancelEdit);

  // ESC键关闭编辑框
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && floatingEditor.style.display === 'block') {
      cancelEdit();
    }
  });

  console.log('Floating editor initialized');
}