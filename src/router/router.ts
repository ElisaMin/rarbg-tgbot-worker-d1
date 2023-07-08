import { html, json, Router, text } from 'itty-router';
import { Env } from '../worker';
import { handleBot } from './internal/bot_header';
import { webAppIndexContent } from '../static';
import { Language } from '../misc/lang';
import { TelegramReply } from '../misc/markdown';
import { Dao } from '../misc/the_dao';


function catchError(fn: () => Promise<Response>):Promise<Response> {
  try {
    return fn()
  } catch (e) {
    console.error(e)
    // @ts-ignore
    return new Response(e.stack || e.message || e.toString(), { status: 500 })
  }
}
function getSFromQuery(query:any) {
   let s = query["s"]
   if (s) {
      return s
   } else if (typeof query == "string") {
      return query
   }
}

export const router = Router()
  .get("/telegram/webapp",async ({url}) => html(webAppIndexContent(url.trim().endsWith("?cn")?Language.zh:Language.en)))
  .get("/telegram/copy/:key", async ({ params }) => catchError(async () => {
     const key = params.key
     const resp = await fetch("https://paste.mozilla.org/"+key+"/raw")
     if (!resp.ok||resp.status!=200) {
        let url = resp.url
        // return response 301
        return Response.redirect(url,301)
     }
     const pasted = await resp.text()

     return html(` <head><meta charset='UTF-8'></head><body><script>let paste='${pasted}';navigator.clipboard.writeText(paste);alert("copied!复制成功!\\n--power by paste.mozilla.org");document.body.innerText=paste</script></body>`)
   }))
  .get("/api/markdown/imdb", async ({ query }) => catchError(async () => {
    const search:string = getSFromQuery(query)
     if (!search || search.length==0 ) {
         return new Response("search must be provided, use `s` define a query .", { status: 400 })
     }
    const lang = query['l'] == 'cn' ? Language.zh : Language.en
    let steam = new TextEncoderStream()
    TelegramReply.IMDBStream(search,steam.writable,lang)
      .then(async () => {
        await steam.writable.close()
      })
    return new Response(steam.readable, { status: 200, headers: { "Content-Type": "text/markdown;charset=utf-8" } })
  }))
  .get("/api/json/imdb", async ({ query }) => catchError(async () => {
      const search:string = getSFromQuery(query)
      if (!search || search.length==0 ) {
            return new Response("search must be provided, use `s` define a query .", { status: 400 })
      }
      const results = []
      for await (let result of Dao.searchIMDB(search)) {
        if (typeof result != "number") {
           results.push(result)
        }
      }
      return  json(results)
  }))
  .post("/api/json", async ({ query }) => catchError(async () => {
     return Dao.searchByJson(await query).then(json)
  }))
  .all("/bot/*", (request,env:Env) => handleBot(request))
  .all("*", (request) => new Response("", { status: 404 }))
