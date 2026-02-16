const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');
const {
  json,
  initAdmin,
  parseBody,
  verifyRequest
} = require('./_lib');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'POST, OPTIONS' } };
  }
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  try {
    const decoded = await verifyRequest(event);
    const body = parseBody(event);
    const answerText = String(body.answerText || '').trim();
    const taskId = String(body.taskId || '').trim();

    if (!answerText) return json(400, { error: 'answerText is required' });

    let feedback = 'Gute Grundlage. Verbessere die Genauigkeit bei Fachbegriffen und ergänze ein konkretes Beispiel.';
    let source = 'fallback';

    const anthropicKey = process.env.ANTHROPIC_API_KEY || '';
    const openaiKey = process.env.OPENAI_API_KEY || '';

    if (anthropicKey) {
      const anthropic = new Anthropic({ apiKey: anthropicKey });
      const message = await anthropic.messages.create({
        model: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022',
        max_tokens: 220,
        temperature: 0.2,
        system: 'Du gibst kurzes, konstruktives Feedback für Schülerinnen und Schüler der Primarstufe. Maximal 80 Wörter.',
        messages: [
          {
            role: 'user',
            content: `Aufgaben-ID: ${taskId || '-'}\nAntwort:\n${answerText}`
          }
        ]
      });
      const text = Array.isArray(message.content)
        ? message.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n').trim()
        : '';
      if (text) {
        feedback = text;
        source = 'anthropic';
      }
    } else if (openaiKey) {
      const client = new OpenAI({ apiKey: openaiKey });
      const completion = await client.responses.create({
        model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
        input: [
          {
            role: 'system',
            content: 'Du gibst kurzes, konstruktives Feedback für Schülerinnen und Schüler der Primarstufe. Maximal 80 Wörter.'
          },
          {
            role: 'user',
            content: `Aufgaben-ID: ${taskId || '-'}\nAntwort:\n${answerText}`
          }
        ]
      });
      const text = (completion.output_text || '').trim();
      if (text) {
        feedback = text;
        source = 'openai';
      }
    }

    const sdk = initAdmin();
    await sdk.firestore().collection('ai_feedback_events').add({
      uid: decoded.uid,
      task_id: taskId,
      answer_text: answerText,
      feedback,
      created_at_iso: new Date().toISOString(),
      source
    });

    return json(200, { ok: true, feedback, source });
  } catch (err) {
    return json(400, { error: err.message || 'Feedback generation failed' });
  }
};
