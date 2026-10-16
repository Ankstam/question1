import { buildDocumentHTML } from "../ui/builder.js";

export async function handlePaperPost(request) {
  try {
    const payload = await request.json();
    return new Response(buildDocumentHTML(payload), {
      headers: { "Content-Type": "text/html;charset=UTF-8" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ code: 400, message: err.message }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }
}
