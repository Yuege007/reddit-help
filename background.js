import { ImageGenerator } from './imageGenerator.js';

// 监听安装事件
chrome.runtime.onInstalled.addListener(() => {
  // 初始化默认配置
  chrome.storage.local.set({
    config: {
      backgroundColor: '#ffffff',
      titleColor: '#333333',
      textColor: '#666666',
      fontFamily: 'Arial, sans-serif'
    }
  });
});

// 添加预览生成状态管理
let generationInProgress = false;

// 处理消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "translate") {
    console.log('Using API Key:', request.apiKey);
    
    // 构建请求参数
    const timestamp = Math.floor(Date.now() / 1000);
    const nonce = Math.random().toString(36).substring(7);
    const version = '2024-01-01';
    const region = 'cn-beijing';
    const service = 'ark';
    
    fetch('https://ark.cn-beijing.volces.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Host': 'ark.cn-beijing.volces.com',
        'X-Date': new Date().toISOString(),
        'Authorization': request.apiKey,
        'X-Content-Sha256': 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', // 空内容的SHA256
        'X-Region': region,
        'X-Service': service,
        'X-Version': version,
        'X-Timestamp': timestamp.toString(),
        'X-Nonce': nonce,
        'X-Coze-App-Id': 'ep-20241214152224-m2ssf'
      },
      body: JSON.stringify({
        endpoint_id: 'ep-20241214152224-m2ssf',
        messages: [
          {
            role: "system",
            content: "你是一个翻译助手，请将以下英文内容翻译成中文，保持原文的语气和风格。翻译时要注意以下几点：1. 保持原文的口语化表达 2. 使用地道的中文表达 3. 保持原文的情感色彩"
          },
          {
            role: "user", 
            content: request.text
          }
        ],
        model: "coze-bot",
        temperature: 0.7,
        top_p: 0.8,
        max_tokens: 2000,
        stream: false
      })
    })
    .then(async response => {
      const responseText = await response.text();
      console.log('API Response:', {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        body: responseText
      });
      
      if (!response.ok) {
        throw new Error(`API请求失败: ${response.status} ${responseText}`);
      }
      return responseText;
    })
    .then(text => {
      sendResponse({ success: true, data: text });
    })
    .catch(error => {
      console.error('Translation error:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
});

// 预览生成函数
async function generatePreview(data) {
  generationInProgress = true;
  
  try {
    await chrome.storage.local.set({
      generationStatus: 'in_progress'
    });

    // 创建一个新的标签页来生成预览
    const tab = await chrome.tabs.create({
      url: 'generator.html',
      active: false
    });

    // 发送消息给新标签页生成预览
    const response = await chrome.tabs.sendMessage(tab.id, {
      action: 'generatePreview',
      data: data
    });

    // 关闭生成标签页
    await chrome.tabs.remove(tab.id);

    return response;
  } catch (error) {
    console.error('Error in generatePreview:', error);
    throw error;
  }
} 

// 添加编辑相关的状态
let states = {
  question: {
    // ... 现有的状态
    originalContent: null,
  },
  answer: {
    // ... 现有的状态
    originalContent: null,
  }
};

// 编辑面板初始化 - 完全独立的函数
function initializeEditPanel() {
  const editPanel = document.querySelector('.edit-panel');
  const closeEditButton = document.querySelector('.close-edit');
  const cancelEditButton = document.querySelector('.cancel-edit');
  const saveEditButton = document.querySelector('.save-edit');
  
  // 如果找不到编辑面板相关元素，直接返回
  if (!editPanel || !closeEditButton) {
    console.warn('Edit panel elements not found - skipping initialization');
    return;
  }

  // 编辑面板相关事件
  closeEditButton.addEventListener('click', hideEditPanel);
  if (cancelEditButton) cancelEditButton.addEventListener('click', hideEditPanel);
  if (saveEditButton) saveEditButton.addEventListener('click', saveEdit);
}

// 显示编辑面板
function showEditPanel() {
  const currentState = states[previewType];
  const editPanel = document.querySelector('.edit-panel');
  const editor = document.querySelector('.content-editor');
  
  if (previewType === 'question') {
    // 问题模式
    editor.value = currentState.content.translatedTitle || currentState.content.title;
  } else {
    // 回答模式
    const currentComment = currentState.content.comments[currentState.currentCommentIndex];
    editor.value = Array.isArray(currentComment.translatedContent) ? 
      currentComment.translatedContent.join('\n\n') : 
      currentComment.translatedContent;
  }
  
  editPanel.style.display = 'block';
}

// 隐藏编辑面板
function hideEditPanel() {
  document.querySelector('.edit-panel').style.display = 'none';
}

// 保存编辑内容
async function saveEdit() {
  const editor = document.querySelector('.content-editor');
  const currentState = states[previewType];
  
  if (previewType === 'question') {
    // 更新问题内容
    currentState.content.translatedTitle = editor.value;
  } else {
    // 更新回答内容
    const currentComment = currentState.content.comments[currentState.currentCommentIndex];
    currentComment.translatedContent = editor.value.split('\n\n');
  }
  
  // 隐藏编辑面板
  hideEditPanel();
  
  // 重新生成预览
  await updatePreview();
}

// 编辑器工具栏初始化
function initializeEditorToolbar() {
  const editorButtons = document.querySelectorAll('.editor-button');
  editorButtons.forEach(button => {
    button.addEventListener('click', (e) => {
      e.stopPropagation(); // 阻止事件冒泡
      
      // 切换当前按钮的active状态
      button.classList.toggle('active');
      
      // 关闭其他按钮的下拉菜单
      editorButtons.forEach(otherButton => {
        if (otherButton !== button) {
          otherButton.classList.remove('active');
        }
      });
    });
  });

  // 点击其他地方关闭所有下拉菜单
  document.addEventListener('click', () => {
    editorButtons.forEach(button => {
      button.classList.remove('active');
    });
  });

  // 阻止下拉菜单内部点击关闭
  document.querySelectorAll('.editor-dropdown').forEach(dropdown => {
    dropdown.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  });
}

// 在DOMContentLoaded事件中初始化编辑功能
document.addEventListener('DOMContentLoaded', async () => {
  try {
    console.log('DOM Content Loaded');
    
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

    // 分别初始化两个功能
    initializeEditorToolbar();  // 编辑器工具栏
    initializeEditPanel();      // 编辑面板（可选功能）
    
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

async function updatePreview() {
  try {
    const currentState = states[previewType];
    const previewElement = document.getElementById(`${previewType}-preview`).querySelector('.preview');
    const downloadButton = document.getElementById(`${previewType}-download`);

    if (!currentState.content) {
      previewElement.innerHTML = '<p>请先点击转换按钮获取内容</p>';
      return;
    }

    console.log('Updating preview with config:', {
      previewType,
      config: currentConfig[previewType],
      content: currentState.content
    });

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
        content: currentState.content,
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