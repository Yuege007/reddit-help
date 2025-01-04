export class Translator {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }

  // 重命名方法以更好地反映其功能
  processTranslation(text) {
    // 定义常见的 Reddit 缩写列表
    const commonAbbreviations = [
      'AITA', 'NTA', 'YTA', 'ESH', 'NAH', 'TIL', 'IMO', 'IMHO', 
      'TL;DR', 'FWIW', 'AFAIK', 'ELI5', 'TIFU', 'FTFY', 'IANAL',
      'PSA', 'AMA', 'CMV', 'NSFW', 'NSFL', 'OP', 'SO', 'FYI'
    ];

    // 1. 处理常见缩写
    let processedText = text.replace(/([^（]*)(（.*?的缩写）)/g, (match, translation) => {
      const abbr = commonAbbreviations.find(a => match.includes(a));
      if (abbr) {
        return `${abbr} (${translation.trim()})`;
      }
      return translation.trim();
    });

    // 2. 删除所有解释性注释（包括英文原文解释）
    processedText = processedText.replace(/(.+?)（[^）]*?）/g, '$1');

    return processedText;
  }

  async translate(text, isTitle = false) {
    try {
      if (isTitle) {
        return await this.translateTitle(text);
      }

      // 处理数组类型的内容
      if (Array.isArray(text)) {
        // 单独翻译每个段落
        const translatedParagraphs = await Promise.all(
          text.map(async (p) => {
            const translated = await this.translateSingle(p.trim(), false);
            return translated;
          })
        );
        return translatedParagraphs;
      }

      // 处理字符串类型的内容
      if (typeof text === 'string') {
        const paragraphs = text.split(/\n\n+/);
        if (paragraphs.length > 1) {
          const translatedParagraphs = await Promise.all(
            paragraphs.map(async (p) => {
              const translated = await this.translateSingle(p.trim(), false);
              return translated;
            })
          );
          return translatedParagraphs;
        }
      }
      
      const translated = await this.translateSingle(text, false);
      return [translated];
    } catch (error) {
      console.error('Translation error:', error);
      throw new Error('翻译失败: ' + error.message);
    }
  }

  // 专门处理标题的翻译
  async translateTitle(text) {
    return await this.translateSingle(text, true);
  }

  // 修改translateSingle方法，添加isTitle参数
  async translateSingle(text, isTitle) {
    // 先检测原文是否包含emoji
    const originalEmojis = Array.from(text.matchAll(
      /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{1F100}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F910}-\u{1F96B}\u{1F980}-\u{1F9E0}]/gu
    ));

    // 根据原文是否包含emoji来设置提示
    const systemPrompt = isTitle ? 
      `你是一个翻译助手。对于标题的翻译规则：
1. 基本要求：
   - 保持简洁
   - 使用地道的中文表达
2. 标题特殊规则：
   - 单个词的名词：加上"关于"构成完整标题
   - 例如："Sleep" → "关于睡眠"
   - 动作或状态：直接翻译
3. 对于英文缩写：
   - 格式为："缩写 (中文含义)"
   - 例如："NTA" → "NTA (不是你的错)"
   - 不要展开英文原文` :
      `你是一个专门翻译Reddit帖子的助手。请注意：
1. 基本要求：
   - 保持原文语气和风格
   - 使用地道的中文表达
   - 保持简洁
2. 对于英文缩写：
   - 格式为："缩写 (中文含义)"
   - 例如："NTA" → "NTA (不是你的错)"
   - 不要展开英文原文
3. 特殊处理：
   - 严格保持原文格式
   - 保持原文的段落格式
   - 保持原文的列表格式（使用圆点）
   - ${originalEmojis.length > 0 ? 
       '保持原文emoji的位置和数量' : 
       '不要添加任何emoji或其他符号'}`;

    // 保存格式信息
    const isList = text.startsWith('•');
    const emojis = Array.from(text.matchAll(
      /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{1F100}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F910}-\u{1F96B}\u{1F980}-\u{1F9E0}]/gu
    ))
      .map(match => ({
        emoji: match[0],
        position: match.index
      }));

    // 处理文本
    let processedText = text;
    if (isList) {
      processedText = text.replace(/^•\s*/, '');  // 移除圆点，注意这里改为•
    }

    // 替换emoji为标记
    for (let i = emojis.length - 1; i >= 0; i--) {
      processedText = processedText.slice(0, emojis[i].position) + 
                     `[EMOJI${i}]` + 
                     processedText.slice(emojis[i].position + emojis[i].emoji.length);
    }

    // 调用翻译API
    const response = await fetch('https://ark.cn-beijing.volces.com/api/v3/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: "ep-20241214152224-m2ssf",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: processedText }
        ],
        temperature: 0.7,
        stream: false
      })
    });

    const data = JSON.parse(await response.text());

    // 恢复格式
    if (data.choices?.[0]?.message) {
      let translatedText = data.choices[0].message.content.trim();
      
      // 处理翻译结果，移除不必要的注释
      translatedText = this.processTranslation(translatedText);
      
      // 恢复emoji
      emojis.forEach((item, i) => {
        translatedText = translatedText.replace(`[EMOJI${i}]`, item.emoji);
      });

      // 恢复列表格式
      return isList ? `• ${translatedText}` : translatedText;
    }
  }
} 