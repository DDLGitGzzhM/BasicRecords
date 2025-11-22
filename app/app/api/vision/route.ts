import { NextResponse } from 'next/server'
import { readBubbles, saveBubbles, readVisionLinks, saveVisionLinks, readVisionBackgrounds, readVisionConfig, saveVisionConfig, type Bubble, type VisionLinks, type VisionConfig } from '@/lib/server/fileStore'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const requestedIndex = searchParams.get('index')
    
    const config = await readVisionConfig()
    const backgrounds = await readVisionBackgrounds()
    const links = await readVisionLinks()
    
    // 如果没有背景图片，确保至少有一个默认背景
    if (backgrounds.length === 0) {
      const defaultBg = await readVisionBackgrounds()
      if (defaultBg.length > 0) {
        config.backgrounds = defaultBg
        config.currentBackgroundIndex = 0
        await saveVisionConfig(config)
      }
    } else {
      // 同步背景列表到配置
      config.backgrounds = backgrounds
      if (config.currentBackgroundIndex >= backgrounds.length) {
        config.currentBackgroundIndex = Math.max(0, backgrounds.length - 1)
      }
      await saveVisionConfig(config)
    }
    
    // 如果请求了特定索引，使用该索引，否则使用配置中的索引
    const targetIndex = requestedIndex !== null ? parseInt(requestedIndex, 10) : config.currentBackgroundIndex
    const safeIndex = Math.max(0, Math.min(targetIndex, config.backgrounds.length - 1))
    
    // 获取指定背景对应的小球
    const currentBackground = config.backgrounds[safeIndex] || config.backgrounds[0] || ''
    const bubbles = config.bubblesByBackground[currentBackground] || []
    
    // 将关联关系合并到小球中
    const linksMap = new Map<string, string[]>()
    for (const link of links.links) {
      if (!linksMap.has(link.bubbleId)) {
        linksMap.set(link.bubbleId, [])
      }
      linksMap.get(link.bubbleId)!.push(link.diaryId)
    }
    
    const bubblesWithLinks = bubbles.map(bubble => ({
      ...bubble,
      diaryIds: linksMap.get(bubble.id) ?? bubble.diaryIds
    }))
    
    // 如果请求所有背景的小球数据（用于"加入已有小球"功能）
    const allBubbles = searchParams.get('all') === 'true'
    if (allBubbles) {
      const allBubblesByBackground: Record<string, Bubble[]> = {}
      for (let i = 0; i < config.backgrounds.length; i++) {
        const bg = config.backgrounds[i]
        const bgBubbles = config.bubblesByBackground[bg] || []
        const bgBubblesWithLinks = bgBubbles.map(bubble => ({
          ...bubble,
          diaryIds: linksMap.get(bubble.id) ?? bubble.diaryIds
        }))
        allBubblesByBackground[bg] = bgBubblesWithLinks
      }
      return NextResponse.json({ 
        data: { 
          bubbles: bubblesWithLinks, 
          backgrounds: config.backgrounds,
          currentBackgroundIndex: safeIndex,
          allBubblesByBackground
        } 
      })
    }
    
    return NextResponse.json({ 
      data: { 
        bubbles: bubblesWithLinks, 
        backgrounds: config.backgrounds,
        currentBackgroundIndex: safeIndex
      } 
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : '读取失败'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { bubbles, currentBackgroundIndex, backgrounds } = body
    
    if (!Array.isArray(bubbles)) {
      return NextResponse.json({ error: '无效的小球数据' }, { status: 400 })
    }
    
    const config = await readVisionConfig()
    
    // 更新背景列表和当前索引
    if (Array.isArray(backgrounds)) {
      config.backgrounds = backgrounds
    }
    if (typeof currentBackgroundIndex === 'number') {
      config.currentBackgroundIndex = currentBackgroundIndex
    }
    
    // 获取当前背景
    const currentBackground = config.backgrounds[config.currentBackgroundIndex] || config.backgrounds[0] || ''
    
    // 保存当前背景对应的小球数据（不包含关联关系）
    const bubblesWithoutLinks = bubbles.map(({ diaryIds, ...bubble }: Bubble) => bubble)
    config.bubblesByBackground[currentBackground] = bubblesWithoutLinks
    
    await saveVisionConfig(config)
    
    // 保存关联关系到 vision-links.json（预留图片关联）
    const links: VisionLinks = {
      links: [],
      imageLinks: [],
      note: '小球与日记 ID 的映射关系，imageLinks 预留用于小球与图片的关联'
    }
    
    for (const bubble of bubbles) {
      if (Array.isArray(bubble.diaryIds) && bubble.diaryIds.length > 0) {
        for (const diaryId of bubble.diaryIds) {
          links.links.push({ bubbleId: bubble.id, diaryId })
        }
      }
    }
    
    await saveVisionLinks(links)
    
    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : '保存失败'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
