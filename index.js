// Add this to your Cloudflare Worker
const GEMINI_API_KEY = TELEGRAM_API_KEY; // Set via Wrangler Secret
const DAILY_LIMIT = 15;

import { parse } from 'url';

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

// Simple in-memory store (reset on Worker restart)
const userUsage = {};

async function handleRequest(request) {
  if (request.method === 'POST') {
    const body = await request.json()
    const chat_id = body.message?.chat?.id
    const text = body.message?.text?.trim()

    if (!chat_id || !text) return new Response("ok")

    // Command handling
    if (text.startsWith('/')) {
      return handleCommand(chat_id, text)
    }

    // Check daily limit
    const today = new Date().toISOString().split('T')[0]
    if (!userUsage[chat_id]) userUsage[chat_id] = {}
    if (!userUsage[chat_id][today]) userUsage[chat_id][today] = 0

    if (userUsage[chat_id][today] >= DAILY_LIMIT) {
      await sendMessage(chat_id, "🚫 Daily limit reached. Try again tomorrow.")
      return new Response("ok")
    }

    // Increment usage
    userUsage[chat_id][today] += 1

    // Call Gemini AI API
    const aiResponse = await callGeminiAI(text)

    await sendMessage(chat_id, aiResponse)
    return new Response("ok")
  }

  return new Response("Telegram AI Bot is running")
}

// Commands
async function handleCommand(chat_id, command) {
  switch(command) {
    case '/start':
      await sendMessage(chat_id, `👋 Welcome! You can ask me anything. Daily limit: ${DAILY_LIMIT} responses.`)
      break
    case '/help':
      await sendMessage(chat_id, `Commands:\n/start - Start bot\n/help - Show commands\n/usage - Check your remaining daily AI responses`)
      break
    case '/usage':
      const today = new Date().toISOString().split('T')[0]
      const used = (userUsage[chat_id] && userUsage[chat_id][today]) || 0
      await sendMessage(chat_id, `You have used ${used}/${DAILY_LIMIT} responses today.`)
      break
    default:
      await sendMessage(chat_id, "❌ Unknown command. Use /help to see commands.")
  }
  return new Response("ok")
}

// Send message via Telegram API
async function sendMessage(chat_id, text) {
  await fetch(`https://api.telegram.org/bot${GEMINI_API_KEY}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id, text })
  })
}

// Call Gemini Free AI API
async function callGeminiAI(prompt) {
  const response = await fetch("https://api.gemini.com/free/ai", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${GEMINI_API_KEY}`
    },
    body: JSON.stringify({
      prompt,
      model: "fast-deep", // fast + deep search model
      max_tokens: 200
    })
  })

  if (!response.ok) return "⚠️ Gemini AI API error, please try later."
  const data = await response.json()
  return data.reply || "⚠️ No response from AI."
}
