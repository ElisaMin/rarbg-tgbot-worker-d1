import { SearchJson, validateArgs } from './the_dao';

export class Language {
   static en = new Language(
     "Not Found",
     "found %d results",
     "Poster",
     "costing %dms",
     "searching...",
     "bad request",
     ()=>"" +
       "Hi, this is a search bot for searching the magnet link from RARBG's backup and its released on a github repository, we have extracted the information from magnet link's `dn` filed aka display name for searching. " +
       "you can search by keywords command eg `/keywords name her, year 2013, vInfo x256, resolution 1080p`,or search a tv show `/keywords name sth, episode s01e05`, we also provide a web surface to make the command works better in private chat, " +
       "you can use just /keyword or /keywords command to get the launcher button.\n" +
       "but theres another command to help you find the magnet links *easily* and its /imdb, it will depend on the result that your input the word's query from IMDb then search the name and year by keyword mode.\n" +
       "by advance searching, we provide the /dn and /sql for searching dn field more fuzzily, first one will replace all [^\\da-Z] char to % and wrap by %%, and the second one will bind your input directly to `dn like ?` in sql.\n" +
       "dont for get to put the trackers on your magnet link, we have /trackers\\_best and /tracker\\_all command. \n" +
       "also note that *dn is very easy to change even a simple copy or some guys trying to misleading*\n" +
       "so thanks for 2004content and RARBG, and cloudflare worker and d1 database we deploy for free.\n" +
       "and this bot has a lot of the bugs, you can report it to my github repository and its OpenSourced.\n" +
       "links:\n" +
       "https://github.com/ElisaMin/rarbg-tgbot-worker-d1\n" +
       "https://github.com/2004content/rarbg\n"+
       "https://github.com/ngosang/trackerslist\n",
     "hello, click the btn for using webapp or see the /help to use this command.",
       "search keyword",
     { name: "name", episode: "episode", year: "year", quality: "resolution", codec: "vInfo", page: "page", },
     {title:"Search...",inTarget:"This message will be sent"},
     "page must be positive",
     "search...",
     "is not a magnet link",
     "this paste board is expired",

   )
   static zh = new Language(
     "没有找到资源",
     "找到 %d 个结果",
     "海报" ,
     "耗时%dms",
     "正在搜索中，请稍后...",
       "请求错误",
     ()=>"" +
       "Rarbg Legacy Search Bot 使用帮助: \n" +
       "    在磁力链中会有&dn=字段，也就是`display name`，显示的名称，RARBG的磁力链会把每个磁力链的信息放在这个字段里。因为它是在链接上的，所以*非常容易修改*，也就是说它非常不可信。所以感谢RARBG的规范化。我们提取除了`名称`、`季集`、`年份`、`视频分辨率`、`编码信息`。\n" +
       "\n" +
       "开源:\n" +
       "    项目地在[ElisaMin/rarbg-tgbot-worker-d1](https://github.com/ElisaMin/rarbg-tgbot-worker-d1)中，你可以提交PR或者Issues为这个Bot添砖加瓦。感谢[2004content](https://github.com/2004content/rarbg)的备份以及[Trackers列表](https://github.com/ngosang/trackerslist)。\n" +
       "\n" +
       "指令:\n" +
       "/imdb \\[...] : 先搜索IMDB，再搜索解析后的dn信息（name和year）。例如：`/imdb 莉莉周`，这个功能很强大，可以搜索很多东西。\n" +
       "/keyword  : 模糊匹配所有的关键字: [年，集，名，分辨率，编码，页]，在私聊中不输入参数可以启动小程序来生成这个（感谢张小龙亲爹，我手刃了我妈）。\n" +
       "/sql  \\[...] : 直接绑定[...]到`dn like ?`进行搜索\n" +
       "/dn   \\[...] : 非字母和数字转换成%也就是linux的\\*，再给两头加上%，绑定到`dn like ?`\n" +
       "/tracker\\_best \\[链接] : 给链接加上开源的tracker列表 \n" +
       "/tracker\\_all  \\[链接] : 给链接加上开源的tracker列表\n" +
     "",
       "你好，请点击按钮手刃张小龙和他妈，或者看/help来使用这个命令。",
         "启动关键词搜索",
       { name: "名", episode: "集", year: "年", quality: "分辨率", codec: "编码", page: "页", },
     {title:"搜索...",inTarget:"这条消息会发送到TG",}
     , "页数是负数！",
     "准备搜索...",
     "磁力链匹配错误",
     "复制内容已过期"

   )
   constructor(
     public notFound: string,
     public foundTitle:string,
     public poster: string,
     public timeCost: string,
     public searching:string,
     public badRequest:string,
     public helpText:()=>string,
     public startWithWebapp:string,
     public startWithWebappBtnName:string,
     public keywords:SearchJson,
     public webappJson:{title:string,inTarget:string},
     public notPage:string,
     public readyToSearch:string,
     public notMagnetLink:string,
     public pasteBinExpired:string,
   ) { }
   found(count:number,from?:string) {
      if (count == 0) return this.notFound
      let found = this.foundTitle
      if (count == 1 && found.endsWith("s") )
         found = found.substring(0,found.length-1)
      if (from)
         from = from+": "
      from = (from)??""
      return from+found.replace("%d",count.toString())
   }
   costing(ms:number) {
      let s = ms / 1000
      if (s < 1) return this.timeCost.replace("%d",ms.toString())
      if (s < 60) return this.timeCost.replace("%dms",s.toFixed(1)+"s")
      let m = s / 60
      if (m < 60) return this.timeCost.replace("%dms",m.toFixed(1)+"m")
      return this.timeCost.replace("%d",ms.toString())
   }
   public static current = Language.zh
   public static setLanguage(lang:"cn"|"en") {
      if (lang == "cn") {
         this.current = Language.zh
      } else {
         this.current = Language.en
      }
   }
   public parseNaturalQuery(query:string):SearchJson {
      let args:SearchJson = {}
      const keywordContents = query.split(/[#,.，。;；]/)
      console.log(keywordContents.join("\n"));
      for (let keywordContent of keywordContents) {
         let keyword="";
         let content="";
         //fistIndex of space
         let index = keywordContent.indexOf(" ")
         if (index > 0) {
            keyword = keywordContent.substring(0, index)
            content = keywordContent.substring(index + 1)
         } else {
            let split = keywordContent.split(/[:：\s=]/)
            if (split.length > 2 && keywordContents.indexOf(split[0]) >= 0) {
               keyword = split[0]
               content = keywordContent.substring(keyword.length + 1)
            }
         }
         keyword = keyword.trim()
         content = content.trim()
         if (content.length == 0 || keyword.length == 0) {
            continue
         }
         console.log(keyword, content);
         if (this == Language.zh) {
            for (const key in this.keywords) {
               // @ts-ignore
               if (keyword.indexOf(this.keywords[key]) >= 0) {
                  // @ts-ignore
                  args[key] = content
                  break
               }
            }
         } else {
            for (const key in this.keywords) {
               // @ts-ignore
               if (keywords[key] == keyword) {
                  // @ts-ignore
                  args[key] = content
                  break
               }
            }
         }
      }
      console.log(args);
      return  validateArgs(args)
   }
   deParseNaturalQuery(args:SearchJson):string {
      let query = ""
      for (const key in args) {
         // @ts-ignore
         let v = args[key]
         if (!v || v.trim().length == 0) continue
         // @ts-ignore
         query += '#'+this.keywords[key] + " " + args[key] + " "
      }
      return query.trim()
   }
}