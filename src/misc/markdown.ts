import { Dao, MagnetLink, MagnetsIMDB, SearchJson } from './the_dao';
import { Language } from './lang';
import { WritableStream } from '@cloudflare/workers-types/2021-11-03/index';


class Markdown {
   protected static infoStringOf(magnet:MagnetLink) {
      let infoString = '';
      let name = magnet.name??undefined;
      if (name) {
         let year = magnet.year ?? '0000';
         name = `${name}_${year}`;
         name = name.replace(/[^a-zA-Z_\d]/g, '_');
         infoString += toTag(name);
         name = undefined;
      }
      magnet.name = undefined;
      let tags = magnet.tags??[];
      if (tags && tags.length > 0) {
         for (let tag of tags) {
            infoString += toTag(tag);
         }
      }
      let skips = ['name', 'year', 'tags', 'hash', 'dn'];
      for (let label in magnet) {
         let skipIndex = skips.indexOf(label);
         if (skipIndex > 0) {
            //remove element
            skips.splice(skipIndex, 1);
            continue;
         }
         // @ts-ignore
         let value = magnet[label];
         if (!value) continue;
         infoString += toTag(value)
      }
      if (infoString.length == 0) {
         infoString = 'link';
      }
      return infoString;
   }
   static markdownInfoStringOf(magnet:MagnetLink) {
      return `- 🏷️ [${this.infoStringOf(magnet)}] \`${MagnetURL.toLink(magnet)}\``
   }

   /**
    * ```preview
    * ✨ ** name **
    * 🎞️ ![](poster)
    * 🕰️ year: 2020
    * 🧑‍💻 IMDB: [tt123456](https://www.imdb.com/title/tt123456)
    * 🧲 Magnets: 3
    *   - 🏷️ [#HEVC] `magnet?...`
    *   - 🏷️ [#H264] `magnet?...`
    *   - 🏷️ [#HDR] `magnet?...`
    *
    * 📀 **A Q zheng zhuan**
    * 🕰️ year: 1981
    * 🧑‍💻 IMDB: [https://www.imdb.com/title/tt0081971/](https://www.imdb.com/title/tt0081971/)
    * 🛑 ~~没有找到资源~~
    * ```
    * @param result
    */
   protected static *parseImdbMagnetsResult(result: MagnetsIMDB) {
      let line = this.line;let link = this.link;let bold = this.bold;let lang = Language.current
      let magnets = result.magnets
      yield line('📀 '+bold(result.name || "UnknownName"))
      let isFound = magnets.length > 0
      if (isFound) {
         let p = result.poster
         if (p) {
            yield line('🎞️ '+this.image(p,lang.poster))
         }
      }
      yield line(`🕰️ year: ${result.year || "?"}`)
      yield line(`🧑‍💻 IMDB: ${link(result.IMDBLink || "?",result.IMDBLink || "?")}`)
      if (!isFound) {
         yield line('🛑 '+this.strikethrough(lang.notFound))
         if (result.error) {
            let errors = result.error.split('\n')
            for (let e of errors) {
               yield line(this.strikethrough("cus: "+e))
            }
         }
      } else {
         yield line("🧲 Magnets: "+magnets.length)
         for (let magnet of magnets) {
            yield line( '  '+this.markdownInfoStringOf(magnet))
         }
      }
      yield line()
      return
   }
   protected static parseMagnetsResults(magnets:MagnetLink[],lang:Language,keyword:string|undefined=undefined):string {
      let result = ""
      if (keyword) {
         result = this.line(this.code(keyword))
      }
      if (magnets.length == 0 ) {
         result += this.line(lang.notFound)
      } else {
         result += this.resultsTitle(magnets.length,lang,"RARBG BACKUP")
         for (let magnet of magnets) {
            result += this.line(this.markdownInfoStringOf(magnet))
         }
      }
      return result
   }
   protected static resultsTitle(count:number,lang:Language,from:string="IMDB") {
      return "🕵️  "+this.line(this.bold(lang.found(count,from)))+this.line()
   }

   static startSearchKeyword(lang:Language,keyword:string) {
      return this.line(lang.readyToSearch)+this.line(this.code(keyword))
   }

   static line(line: string="") {
      return line + lineBreak
   }
   static bold(text: string) {
      return `*${text}*`
   }
   static italic(text: string) {
      return `_${text}_`
   }
   static strikethrough(text: string) {
      return `~${text}~`
   }
   static code(text: string) {
      return `\`${text}\``
   }
   static link(text: string, url: string) {
      return `[${text}](${url})`
   }
   static image(url: string,text: string="") {
      return `![${text}](${url})`
   }

}
export class TelegramReply extends Markdown {

   static async searchJson(json:SearchJson,lang:Language,keyword:string|undefined=undefined) {
      const searched = await Dao.searchByJson(json)
      return {
         text: this.parseMagnetsResults(searched,lang,keyword),
         length: searched.length
      }
   }
   static searchDN(query: string,lang:Language,parse:boolean,page:number) {
      return Dao.searchByDN(query,parse,page)
        .then(magnets => {return {text:this.parseMagnetsResults(magnets,lang),length:magnets.length}})
   }
   static IMDBStream(query: string, stream:WritableStream, lang:Language=Language.current) {
      let w = stream.getWriter()
      let onLine = (line: string) => w.write(line)
      return this.IMDBChunked(query, onLine, lang).then(async () => w.releaseLock())
   }
   public static IMDBChunked(query: string, onChunk: (text?: string) => Promise<void>, lang:Language) {
      return this.queryIMDB(query,lang,
          length => onChunk(this.resultsTitle(length,lang, "IMDB")),
        async (costing) => {
           await onChunk(this.line() + this.line(this.italic(lang.costing(costing))))
        },
        onChunk
      )
   }
   public static async queryIMDB(
     query: string, lang: Language,
     onLength: (length: number) => void,
     timeCount: (time: number) => void,
     onChunk: (text?: string) => Promise<void>,
   ) {
      let result: AsyncGenerator<MagnetsIMDB|number> = Dao.searchIMDB(query)
      let isCount = false
      for await (let movie of result) {
         if (typeof movie == "number") {
            if (isCount) timeCount(movie)
            else onLength(movie)
            isCount = true
         } else {
            let markdown = ""
            for await (const markdownLine of this.parseImdbMagnetsResult(movie)) {
               markdown += markdownLine
            }
            await onChunk(markdown)
         }
      }
   }
}
const lineBreak = '\n'
function toTag(str: string) {
   return '#' + str
       .replace(/[^a-zA-Z_\d]/g, '_')
     + ' ';
}

export const MagnetURL = {
   trackersInUrl: '',
   toLink(info: MagnetLink) {
      return `magnet:?xt=urn:btih:${info.hash}&dn=${encodeURIComponent(info.dn)}${MagnetURL.trackersInUrl}`;
   }
};