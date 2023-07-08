import { Message } from './bot_handler';

export class BotApiBase {
   protected url: string;
   token: string;

   protected constructor(token: string) {
      this.token = token;
      this.url = 'https://api.telegram.org/bot' + token;
   }

   protected async wrapRequest(makeRequest:(setPath:(path:string)=>void)=>(RequestInit|undefined)) {
      let path = ''
      let requestInit = await makeRequest((p)=>{path = p})
      let url = this.url + path
      try {
         let response = await fetch(url, requestInit)
         console.debug("response",response.statusText,response.status);
         let json:any = await response.json()
         if (!json.ok||response.status!=200) {
            json.ok = undefined
            json.description = json.description||response.statusText
            json.code = response.status
            json.api = path.replace(/[A-Z]/g,(s)=>` ${s.toLowerCase()}`)
              .replace(/^\//,"")
            console.error(json)
            // noinspection ExceptionCaughtLocallyJS
            throw Error(`${json.api} failed: ${json.description} `)
         }
         console.debug({
            url:path,
            ...json
         });
         return json.result
      } catch (e) {
         console.error("wrap",url,requestInit);
         throw e
         // return {ok:true}
      }
   }
   // protected byGet(path: string, data: any) {
   //    return this.wrapRequest(setPath => {
   //       setPath(addURLOptions(this.url,data))
   //       return undefined
   //    })
   // }

   protected async byPost(path: string, data: any) {
      return this.wrapRequest((setPath)=>{
         setPath(path)
         return {
            method: 'POST',
            body: JSON.stringify(data),
            headers: {
               'Content-Type': 'application/json'
            }
         }
      })
   }
}
type KeyboardButton = {
   text: string,
   request_contact?: boolean,
   request_location?: boolean,
   web_app?:WebAppInfo
}
type ReplyKeyboardMarkup = {
   keyboard: (string|KeyboardButton)[][],
   resize_keyboard?: boolean,
   one_time_keyboard?: boolean,
   selective?: boolean
}
type InlineKeyboardButton = {
   text: string,
   url?: string,
   callback_data?: string,
   callback_game?: any,
   web_app?:WebAppInfo
}
type InlineKeyboardMarkup = {
   inline_keyboard: InlineKeyboardButton[][]
}
type WebAppInfo = {
   url: string,
}

type SendMessageByJsonData = {
   chat_id: string | number,
   text: string,
   parse_mode?: string,
   disable_web_page_preview?: boolean,
   disable_notification?: boolean,
   reply_to_message_id?: number,
   reply_markup?: ReplyKeyboardMarkup|InlineKeyboardMarkup
}

export class BotApi extends BotApiBase {

   async sendMessageByJson(data: SendMessageByJsonData) {
      return this.byPost('/sendMessage', data);
   }

   async sendMessage(
     chat_id: string | number,
     text: string,
     reply_to_message_id: number = 0,
     parse_mode: string = '',
     disable_web_page_preview: boolean = false,
     disable_notification: boolean = false
   ): Promise<Message> {
      const data = {
         chat_id: chat_id,
         text: text,
         parse_mode: parse_mode,
         disable_web_page_preview: disable_web_page_preview,
         disable_notification: disable_notification,
         reply_to_message_id: reply_to_message_id
      };
      return this.byPost('/sendMessage', data);
   }

   async editMessageText(args: {
      chat_id?: string | number,
      message_id: number | string,
      text: string,
      parse_mode?: string,
      inline_message_id?: string,
   }) {
      return this.byPost('/editMessageText', args);
   }
   // send chat action to bot api
   async sendChatAction(chat_id: string|number, action: 'typing' | 'upload_document') {
      // const url = this.url + '/sendChatAction';
      const data = {
         chat_id: chat_id,
         action: action
      };
      return this.byPost('/sendChatAction', data);
   }
   async answerCallbackQuery(args: {
      callback_query_id: string|number,
      url?: string,
   }){
      return this.byPost('/answerCallbackQuery', args);
   }
}