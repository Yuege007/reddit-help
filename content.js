console.log('Content script loaded');

// 从URL获取帖子ID
function getPostIdFromUrl() {
  const urlParts = window.location.pathname.split('/');
  const commentsIndex = urlParts.indexOf('comments');
  return commentsIndex !== -1 ? urlParts[commentsIndex + 1] : null;
}

// 提取评论数据
function extractComments(commentsData) {
  // 1. 提取所有评论（包括嵌套评论）
  function getAllComments(comment) {
    let comments = [comment];
    if (comment.data.replies) {
      comment.data.replies.data.children.forEach(reply => {
        if (reply.kind === 't1') {  // 't1'是评论类型
          comments = comments.concat(getAllComments(reply));
        }
      });
    }
    return comments;
  }

  // 2. 获取所有评论并按分数排序
  const allComments = commentsData.data.children
    .filter(child => child.kind === 't1')
    .flatMap(comment => getAllComments(comment))
    .filter(comment => 
      comment.data?.author && 
      comment.data?.body &&
      !comment.data.body.includes('[deleted]') &&
      !comment.data.body.includes('[removed]')
    )
    .sort((a, b) => (b.data.score || 0) - (a.data.score || 0))
    .slice(0, 8)  // 修改这里：从5改为8
    .map(comment => ({
      author: comment.data.author,
      content: comment.data.body,
      score: comment.data.score,
      parent_id: comment.data.parent_id
    }));

  return allComments;
}

// 添加HTML解码函数
function decodeHtml(html) {
  const txt = document.createElement('textarea');
  txt.innerHTML = html;
  return txt.value;
}

// 获取帖子和评论数据
async function fetchRedditData() {
  try {
    const postId = getPostIdFromUrl();
    const response = await fetch(`https://www.reddit.com/comments/${postId}.json`);
    const [postData, commentsData] = await response.json();
    
    // 打印完整的API响应
    console.log('API Response:', {
      postData: postData.data.children[0].data,
      commentsData: commentsData.data.children
    });

    const post = postData.data.children[0].data;

    // post中的关键字段
    console.log({
      selftext: post.selftext,        // 原始markdown文本
      selftext_html: post.selftext_html  // HTML格式（我们不需要这个）
    });

    // 处理markdown格式的文本
    const content = post.selftext
      .split('\n')
      .map(line => {
        line = line.trim();
        // 将所有列表标记（*、-）转换为圆点
        if (line.match(/^[*•-]\s/)) {
          return `• ${line.replace(/^[*•-]\s/, '')}`;  // 只在这里添加一次圆点
        }
        // 检查其他可能的markdown格式
        // 1. 引用
        if (line.startsWith('>')) {
          return line;  // 保持引用格式
        }
        // 2. 标题
        if (line.startsWith('#')) {
          return line;  // 保持标题格式
        }
        // 3. 代码块
        if (line.startsWith('```') || line.startsWith('`')) {
          return line;  // 保持代码块格式
        }
        return line;
      })
      .filter(line => line.length > 0);

    console.log('Processed content:', {
      original: post.selftext,
      processed: content,
      format: content.map(line => ({
        text: line,
        isList: line.startsWith('*'),
        isQuote: line.startsWith('>'),
        isCode: line.startsWith('`'),
        hasEmoji: /[\u{1F300}-\u{1F9FF}]/u.test(line)
      }))
    });

    // 修改获取subreddit图标的逻辑
    let subredditIcon = null;
    try {
      // 通过 about.json API 获取
      const aboutResponse = await fetch(`https://www.reddit.com/r/${post.subreddit}/about.json`);
      if (aboutResponse.ok) {
        const aboutData = await aboutResponse.json();
        console.log('Subreddit icon sources:', {
          community_icon: aboutData.data?.community_icon,
          icon_img: aboutData.data?.icon_img,
          header_img: aboutData.data?.header_img
        });
        
        // 按优先级尝试不同的图标源
        subredditIcon = aboutData.data?.community_icon || 
                       aboutData.data?.icon_img || 
                       aboutData.data?.header_img;

        // 处理URL编码
        if (subredditIcon) {
          subredditIcon = subredditIcon.replace(/&amp;/g, '&');
        }
      }
    } catch (error) {
      console.error('Failed to fetch subreddit icon:', error);
    }

    return {
      title: post.title,
      author: post.author,
      content: content,
      subreddit: `r/${post.subreddit}`,
      subredditIcon: subredditIcon,  // 使用获取到的图标
      comments: extractComments(commentsData)
    };
  } catch (error) {
    console.error('API fetch error:', error);
    throw error;
  }
}

// 提取列表内容
function extractList(element) {
  const items = element.querySelectorAll('li');
  return Array.from(items).map(li => {
    const p = li.querySelector('p');
    return p ? p.textContent.trim() : li.textContent.trim();
  });
}

// 消息监听器
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "extract") {
    try {
      fetchRedditData()
        .then(async data => {
          console.log('API data:', data);  // 添加日志
          
          // 不再覆盖API返回的content
          sendResponse(data);
        })
        .catch(error => {
          console.error('Data extraction failed:', error);
          sendResponse({ error: error.message });
        });
    } catch (error) {
      sendResponse({ error: error.message });
    }
  }
  return true;
}); 

// 添加一个函数来检查页面结构
function inspectPageStructure() {
  const listElement = document.querySelector('ul');
  if (listElement) {
    console.log('List HTML structure:', {
      outerHTML: listElement.outerHTML,
      className: listElement.className,
      style: window.getComputedStyle(listElement)
    });

    // 检查列表项
    const items = listElement.querySelectorAll('li');
    items.forEach((item, index) => {
      console.log(`List item ${index}:`, {
        outerHTML: item.outerHTML,
        className: item.className,
        style: window.getComputedStyle(item)
      });
    });
  }
} 