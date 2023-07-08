import { BotApi } from './bot_api';

export interface BotResponse  {
   ok:boolean
}

/**
 * ```config
 * {
 *  botUrlOnPath:"/bot/",
 *  BotUrlOnHost:"https://bot.example.com",
 *  bots:Array<BotInit>({
 *    token:"1234567890:ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890",
 *  })
 *  ```
 */
export async function tgBotHandling(request:Request,config:Config,...args:any){
   let resp = await new BotHandler(config).responseOrWithBot(request,args)
   if (resp instanceof Response) return resp
   return resp()
}

// export type RequestMore = {
//   size: number
//   type: string
//   content: { message?: string, error?: string }
// } & Request
export type User = {
   id: number;
   language_code: string;
}
export type WebAppReply = {
   button_text: string
   data: string
}
export type Message = {
   message_id: number
   from: User
   chat: Chat
   text?: string
   web_app_data?: WebAppReply,
   reply_to_message?: Message
}
type Chat = {
   id: number;
   type: string;
}
export type CallbackQuery = {
   id: string;
   from: User;
   message: Message;
   data: string;
}
export type Update = {
   update_id: number;
   message?: Message;
   callback_query?: CallbackQuery;
   edited_message?: Message;
}
export type Config = {
   botUrlOnPath:string,
   BotUrlOnHost:string,
   bots:Array<BotInit>
}
export type BotInit = {
   token:string,
   key?:string,
   getBot:(args:unknown[])=>Promise<Bot>
}

export abstract class Bot extends BotApi {
   // key:()=>Promise<string>
   handleMessage:(update:Message)=>Promise<BotResponse>
   handleCallback:(callback:CallbackQuery)=>Promise<BotResponse>
   withUrl(path:string):string {
      return this.url+path
   }
   // handleWebhook:(update:Message)=>Promise<BotResponse>
}

class BotHandler {
   constructor(
     private config:Config
   ) { }
   private keys:Promise<string[]>
   private async getBot(botHash:string,args:any[]):Promise<Bot|undefined> {
      let bots = this.config.bots
      await this.keys

      let bot = bots.find((b)=>b.key==botHash)
      if (!bot) return
      return bot.getBot(args)
   }
   private responseNothings() {
      console.error(JSON.stringify(this.request.headers))
      return new Response(null, { status: 404 })
   }
   private responseError(error:string|null=null) {
      console.error(this.request.headers)
      return new Response(error, { status: 403 })
   }

   private data:any
   private async updateReqBodyOrResp() {
      let request = this.request
      let length = parseInt(request.headers.get("content-length"))
      if (!length|| isNaN(length)||length<6) return this.responseError()
      let type = request.headers.get("content-type")
        .split(";")[0].trim()
      if (!type||type.length<3) return this.responseError()
      if (type!="application/json") return this.responseError()
      return request.json().then((data) => {
         console.log("data", data)
         this.data = data
         return this.data
      })
   }

   private request:Request

   private generateKeys() {
      if (this.keys) return
      this.keys = new Promise<string[]>(async (re) => {
         let asyncK = this.config.bots.map(async (b) => {
            b.key = await sha256(b.token);
            return b
         })
         this.config.bots = await Promise.all(asyncK)
         let keys = this.config.bots.map((b) => b.key).filter(k => k)

         if (keys.length == 0) {
            throw new Error("no bots")
         }
         console.log("keys", this.config.bots.map((b) => b.key))
         re(keys)
      })
   }
   checkHash(hash:string) {
      if(!hash||hash.length!=64||!hash.match(/^[a-f0-9]/)) {
         return;
      } else {
         return hash
      }
   }
   getValidateUrlInfo(path:string) {
      let prefix = this.config.botUrlOnPath
      if (!path.startsWith(prefix)) {
         return;
      }
      let paths = path.substring(prefix.length)
        .split("/")
        .filter(s=>s.length>2)
      if (paths.length<1) return;
      let hash = this.checkHash(paths[0])
      if (!hash) return;
      return paths
   }
   async responseOrWithBot(request:Request,args:any[]) {
      this.generateKeys()
      this.request = request
      let isGET = request.method == "GET"
      let data;
      //async
      if (!isGET)
         data = this.updateReqBodyOrResp()
      //check url
      let url = new URL(request.url);
      let paths = this.getValidateUrlInfo(url.pathname)
      if (!paths||paths.length==0||paths.length>4) {
         return this.responseNothings()
      }
      //check bot
      let botHash = this.checkHash(paths.shift())
      if (!botHash) {
         console.error("bot in url", botHash)
         return this.responseNothings()
      }
      let bot = await this.getBot(botHash,args)
      if (!bot) {
         console.error("hash is not ready yet :", botHash)
         return this.responseNothings();
      }
      //check webhook
      if (isGET) {
         if (paths.length!=1) {
            console.error("webhook path is empty", paths)
            return this.responseNothings();
         }
         let path = paths.shift()
         // if (path!="webhook") return this.responseNothings()
         // path = paths.shift()
         let resp = await this.webhookOf(bot,path)
         // console.error("webhook", path);
         return resp ?? this.responseNothings()
      }
      //check data
      let body = await data as Update
      if (!body["update_id"]) {
         return this.responseError("no update_id")
      }
      const okResp = (pms:Promise<BotResponse>) => pms.then((resp) => {
         if (resp.ok) return new Response("True", { status: 200 })
         return this.responseError("not ok")
      })
      if (body.update_id>0) {
         const msg = body.message
         if (msg) return () => okResp(bot.handleMessage(msg))
         const callback = body.callback_query
         if (callback) return () => okResp(bot.handleCallback(callback))
         if (body.edited_message)
         return new Response("True", { status: 200 })
      }

      throw new Error("no message or callback")
   }
   webhook?:string
   private getWebhookUrl(key:string) {
      if (!this.webhook) {
         let host = this.config.BotUrlOnHost
         let path = this.config.botUrlOnPath
         if (host.endsWith("/")&&path.startsWith("/")) {
            host.substring(0,path.length-1)
         }
         this.webhook = encodeURI(`${host}${path}${key}`)
      }
      return this.webhook
   }
   private async webhookOf(bot: Bot,path:string):Promise<Response|undefined> {
      let url
      if (path.length==0) return undefined
      switch (path) {
         case "getMe":
            url = bot.withUrl("/getMe")
            break;
         case "info":
            url = bot.withUrl("/getWebhookInfo")
            break;
         case "del":
            url = bot.withUrl("/deleteWebhook")
            break
         case "set":
            let key = this.config.bots.find((b) => b.token == bot.token)?.key
            if (!key) return undefined
            url = bot.withUrl("/setWebhook?url="+this.getWebhookUrl(key))
      }
      if (!url) return undefined
      console.log("webhook", path, url)
      return fetch(url).then((resp)=>new Response(resp.body,resp))
   }
}


// SHA256 Hash function
export async function sha256(message: string): Promise<string|undefined> {
   if (message.length == 0) return undefined ;
   // new TextDecoder().decode(new Uint8Array([0x00]));
   // encode as UTF-8
   const msgBuffer = new TextEncoder().encode(message);
   // hash the message
   const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
   // convert ArrayBuffer to Array
   const hashArray = Array.from(new Uint8Array(hashBuffer));
   // convert bytes to hex string
   const hashHex = hashArray.map(b => ('00' + b.toString(16)).slice(-2)).join('');
   return hashHex;

   // return message;
}
