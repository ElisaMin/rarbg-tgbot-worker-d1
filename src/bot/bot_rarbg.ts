import { BotApi } from './bot_api';
import { Bot, BotResponse, CallbackQuery, Message, User } from './bot_handler';
import { Language } from '../misc/lang';
import { TelegramReply } from '../misc/markdown';
import { pageLimit, SearchJson } from '../misc/the_dao';
import { ENV } from '../router/internal/bot_header';

// ### handle commands
async function imdbQuery(ctx: Context, query: string) {
   await sendMsg(ctx, ctx.lang.searching)
   const onText = async (text: string) => sendMsg(ctx,text)
   return await TelegramReply.IMDBChunked(query, onText,ctx.lang)
}
async function keyword(ctx: Context, query: string) {
   let args: SearchJson;
   await pageReply(ctx, () => {
      args = ctx.lang.parseNaturalQuery(query)
      let page = Number(args.page)
      if (args.page !== undefined && isNaN(page)) {
         throw new Error(ctx.lang.notPage)
      } else {
         page = ctx.page
      }
      if (page != 0 && !page || isNaN(page) ) {
         throw new Error(ctx.lang.notPage+"  2")
      }
      ctx.page = page
      args.page = ''+page
      console.log("has page,"+page)
   }, () => TelegramReply.searchJson(args, ctx.lang, '/keywords '+ctx.lang.deParseNaturalQuery(args)))
}

async function keywordWebApp(ctx: Context) {
   let url = "https://rarbg.lge.fun/telegram/webapp"
   if (ctx.lang==Language.zh) {
      url+='?cn'
   }
   let extraSendData = {
      reply_markup: {
         keyboard: [
            [{ text: ctx.lang.startWithWebappBtnName, web_app: { url: url } }],
         ]
      }
   }
   await sendMsg(ctx, ctx.lang.startWithWebapp,extraSendData)
}
async function searchDN(ctx:Context,query:string,parse:boolean) {
   return await pageReply(
     ctx,
     () => {if (!ctx.page) ctx.page = 1},
     () => TelegramReply.searchDN(query,ctx.lang,parse,ctx.page))
}
async function trackers(ctx:Context,isAll:boolean,link:string) {
   let match = link.match(/magnet:\?xt=urn:btih:([a-zA-Z0-9]+)/)
   if (!match) {
      return await sendMsg(ctx,ctx.lang.notMagnetLink)
   }
   const trackerLinkUrl = `https://raw.githubusercontent.com/ngosang/trackerslist/master/trackers_${isAll?"all":"best"}.txt`
   const trackerLinks = await fetch(trackerLinkUrl).then(resp=>resp.text())
   const trackersInUrl = trackerLinks.replace(/(\S+)\n\n/g,"&tr=$1")
   let reply =  `${link}${trackersInUrl}`
   if (reply.length>4096) {
      //use paste.mozilla.org
      const url = await fetch("https://pastebin.mozilla.org/api/",{
         headers:{
           "content-type":"application/x-www-form-urlencoded"
         },
         method:"POST",
         body:'expire=3600&content='+encodeURIComponent(reply)
      }).then(async resp => {
         let content = await resp.text()
         if (resp.status===400) {
            throw new Error(content)
         }
         return content.substring(1,content.length-1)
      })
      const autocopy = "https://rarbg.lge.fun/telegram/copy/"+url.substring(url.lastIndexOf("/")+1)
      // send reply its link with inline btn
      return await sendMsg(ctx,`msg too long, cached in 1h.` ,{reply_markup:{
         inline_keyboard:[[{text:"copy in browser",url:autocopy}]]
      }})
   } else
   return sendMsg(ctx,`${link}${trackersInUrl}`)
}
// ## context
type Context = {
   msg:string,
   msgIdForReply:number,
   msgIdForEdit?:number,
   chatId:number,
   api:BotApi,
   cachedMsg?:string,
   page?:number,
   lang:Language,
}

function updateStage(ctx:Context,msg:'typing' | 'upload_document'='typing') {
   return ctx.api.sendChatAction(ctx.chatId,msg)
}
function updateMsg(ctx:Context,msg:string,extra:any|undefined=undefined) {
   return ctx.api.editMessageText({
      chat_id:ctx.chatId,
      message_id:ctx.msgIdForEdit,
      text:msg,
      parse_mode:"Markdown",
      ...extra
   })
}
function sendMsg(ctx:Context,msg:string,extra:any|undefined=undefined) {
   return ctx.api.sendMessageByJson({
      chat_id:ctx.chatId,
      text:msg,
      reply_to_message_id:ctx.msgIdForReply,
      parse_mode:"Markdown",
      ...extra
   }).then(async (resp) => {
      ctx.msgIdForEdit = resp.message_id
   })
}
async function onMsg(ctx: Context, msg: string) { return new Promise(async (ended,failed)=> {
   const chunks:string[] = []
   let left = (ctx.cachedMsg??"")+msg
   if (left.length>2048) do {
         let lastLineIndex = left.lastIndexOf('*\n', 4095)
         if (lastLineIndex == -1) {
            lastLineIndex = left.lastIndexOf("\n",4095)+1
         } else {
            lastLineIndex+=2
         }
         chunks.push(left.substring(0,lastLineIndex))
         left = left.substring(lastLineIndex)
      } while (left.length>0)
   else {
      chunks.push(left)
   }
   ctx.cachedMsg = chunks.pop()
   chunks.push(ctx.cachedMsg)
   let shouldBeUpdate = chunks.length>1
   const intervalHandler = setInterval(async () => {
      const chunked = chunks.shift()
      if (!chunked) {
         clearInterval(intervalHandler)
         return ended(undefined)
      }
      try {
         if (ctx.msgIdForEdit) {
            await updateMsg(ctx,chunked)
         } else {
            await sendMsg(ctx,chunked)
         }
      } catch (e) {
         clearInterval(intervalHandler)
         return failed(e)
      }
      if (shouldBeUpdate) {
         shouldBeUpdate = false
         ctx.msgIdForEdit = undefined
      }
   },300)
   })
}
async function pageReply(
  ctx: Context,
  checkArgs:()=>void,
  query:()=>Promise<{text:string,length:number }>
) {
   const onText = async (text: string) => onMsg(ctx,text)
   try {
      checkArgs()
   } catch (e) {
      await onText('🚫 '+e.message)
      console.error(e.stack)
      return
   }
   let page= ctx.page
   if (isNaN(page)) {
      throw new Error("page is null")
   }
   if (page<0) {
      await onText(ctx.lang.notPage)
      return
   }
   const prevPage = {text:"👈",callback_data:'page'+(page-1)}
   const nextPage = {text:"👉",callback_data:'page'+(page+1)}
   if (!page||page == 0) {
      nextPage.text = "Start!"
      await sendMsg(ctx, ctx.lang.readyToSearch,{
         reply_markup :{
            inline_keyboard: [[nextPage]]
         }
      })
      return
   }
   await onText("🔍 "+ctx.lang.searching+"...  \n")
   const {text,length } = await query()
   const keyboard = []
   if (page > 1) {
      keyboard.push(prevPage)
   }
   if (length>pageLimit-1) {
      keyboard.push(nextPage)
   }

   await updateMsg(ctx, text,{
      reply_markup :{
         inline_keyboard: [keyboard]
      }
   })
}


export class RarbgBot extends BotApi implements Bot {

   constructor(
     public readonly token: string,
   ) {
      super(token);
   }
   lang:Language


   static commands:string[] = ["imdb","keyword",'keywords',"dn","sql","help","start","trackers_all","trackers_best"]
   testMsg (msg?:string)  {
      if (!msg||typeof msg!=="string") return;
      msg = msg.trim().replace(/\/(\S+)@(\S+)/, '/$1')
      if (msg.length<4) {
         return;
      }
      if (!msg.startsWith('/') && !msg.startsWith('#')) {
         return;
      }
      // drop first char
      msg = msg.substring(1).trim();
      console.log("testMsg",msg)
      let space = msg.indexOf(' ')
      if (space == -1) {
         space = msg.length
      }
      let prefix = msg.substring(0, space);
      let command;
      if (prefix.length>0) {
         command = RarbgBot.commands.find((c)=>c===prefix)
      }
      if (!command || command?.length == 0) {
         return { command:undefined,body:undefined }
      }
      if (command.length > 1) {
         if (command === 'keywords') {
            command = 'keyword'
         }
         let body: string;
         if (msg.length>command.length+1) {
            body = msg.substring(command.length + 1).trim();
         }
         return { command:command,body:body }
      }
   }
   context:Context
   private makeContext(message: Message,page:number=undefined) {
      this.context = {
         msg:message.text!,
         msgIdForReply:message.message_id,
         chatId:message.chat.id,
         api:this,
         lang:this.lang,
         cachedMsg:'',
         page:page
      }
   }
   // db: D1Database;.
   async handling(message: Message) {
      let text = message.text??message.web_app_data?.data
      if (!text) return
      let test = this.testMsg(text)
      let command = test?.command
      let body = test?.body
      console.log("handling",command,body)
      if (!command) {
         console.error("is not command",message.text,)
         return
      }
      const ctx:Context = this.context
      await updateStage(ctx)
      if (command === 'keyword') {
         if (!body) {
            if (message.chat.type === 'private')
               await keywordWebApp(ctx);
            else {
               await sendMsg(ctx, ctx.lang.helpText())
            }
         } else {
            if (isNaN(ctx.page)) ctx.page = 0;
            await keyword(ctx, body);
         }
         return true
      } else if (command === 'help'||command === 'start') {
         const help = this.lang.helpText()
         console.log(help);
         await sendMsg(ctx, help)
         return true
      }
      if (!body||body.length<2) return false

      if (command === 'imdb') {
         await imdbQuery(ctx,body)
      } else if (command === 'dn') {
         await searchDN(ctx, body, true);
      } else if (command === 'sql') {
         if (!body) return false;
         await searchDN(ctx, body, false);
      } else if (command.startsWith("trackers_")) {
         const isAll = command.endsWith("all")
         await trackers(ctx,isAll,body)
      }
      return true
   }
   private setLang(user:User) {
      if (user.language_code?.startsWith('zh-')) {
         Language.setLanguage('cn')
      } else {
         Language.setLanguage('en')
      }
      this.lang = Language.current
   }

   async withError(e: any, more: string="") {
      await this.sendMessageByJson({
         chat_id: ENV.ADMIN_ID,
         parse_mode: 'HTML',
         text: (`<b> error ! </b>\n\n${e.message || JSON.stringify(e)}\n<pre>${e.stack}</pre>${more}`),
      })
   }
   private async handleFn(msg:Message,fn:()=>Promise<BotResponse>) {
      try {
         this.setLang(msg.from)
         return await fn()
      } catch (e) {
         if (e instanceof Error) {
            console.error(e.stack)
         } else {
            console.error(JSON.stringify(e))
         }
         await trySent(async ()=>{
            await this.sendMessageByJson({
               chat_id: msg.chat.id,
               text: e.message,
               reply_to_message_id: msg.message_id,
            })
         }).catch((err)=>{
            e.message = e.message+'\nand more\n'+err.message
         })
         await trySent(async ()=> {
            await this.withError(e, `\n\n<tg-spoiler><pre>${JSON.stringify(msg)}</pre></tg-spoiler>`)
         })
         return { ok: true}
         // throw e;
      }

   }

   async handleMessage(m: Message): Promise<BotResponse> {
      return this.handleFn(m,async () => {
         this.makeContext(m)
         let reply = await this.handling(m)
         if (!reply) {
            await this.sendMessage(m.chat.id, this.lang.badRequest)
         }
         return { ok: true }
      })
   }
   async handleCallback(q:CallbackQuery) {
      return this.handleFn(q.message,async () => {
         let m = q.message.reply_to_message
         if (!m?.message_id) {
            throw new Error("no message_id")
         }
         let callback: string|number = q.data
         if (callback.startsWith('page')) {
            callback = Number(callback.substring(4))
            if (isNaN(callback)) {
               throw new Error("page is NaN")
            }
            this.setLang(m.from)
            this.makeContext(m)
            this.context.msgIdForEdit = q.message.message_id
            this.context.page = callback
            let reply = await this.handling(m)
            if (!reply) {
               await this.sendMessage(m.chat.id, this.lang.badRequest)
            }
         } else {
            await this.sendMessage(q.message.chat.id, this.lang.badRequest)
         }
         await this.answerCallbackQuery({ callback_query_id: q.id })
         return { ok: true}
      })
   }

   withUrl(path: string): string {
      return  this.url + path;
   }


}
async function trySent<T>(block: () => Promise<T>,times:number=10):Promise<T> {
   return new Promise(async (resolve, reject) => {
      let time = 0
      let handler = setInterval(async ()=>{
         try {
            let r = await block()
            clearInterval(handler)
            resolve(r)
         } catch (e) {
            if (time ++ > times) {
               clearInterval(handler)
               reject(e)
            }
         }
      },300)
   })
}
