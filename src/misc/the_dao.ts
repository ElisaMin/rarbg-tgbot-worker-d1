
export const getDbSearchString = (s:string) => s
  .replace(/[^a-zA-Z\d]/g, " ")
  .replace(/\s+/g, "%")

export const pageLimit = 20

const joinTable:string =
  // language=SQLite
  "select names.name as name,dn,year,episode,codec, hash, dn, year, codec, quality, episode from names left join magnets on magnets.name_id = names.id"

export class Dao {

   private static db: D1Database
   static setDB(db: D1Database) {
      if (!db || !db.prepare) {
         throw Error("db is not valid")

      }
      Dao.db = db
   }
   static getDB() {
      return Dao.db
   }

   static searchByDN(dn: string, parse:boolean=false, page:number=1) {
      if (parse) {
         dn = getDbSearchString(`%${dn}%`)
      }
      page = page-1
      console.log("searchByDN",dn,page,parse)
      return this.queryAndBind(`${joinTable} WHERE dn LIKE ? limit ? offset ?`, [dn, pageLimit, page*pageLimit])
   }
   static async searchNamesByHash(hashes: string[]) {
      if (hashes.length == 0) {
         let result:Array<MagnetLink> = []
         return result
      }
      return this.queryAndBind(
        `${joinTable} WHERE ${this.getWhereSql(hashes)}`, hashes
      )
   }
   static async searchInfosByHash(hashes: string[]) {
      if (hashes.length == 0) {
         let result:Array<MagnetLink> = []
         return result
      }
      return this.queryAndBind(
        `select * from magnets WHERE ${this.getWhereSql(hashes)}`, hashes
      ).then(l=>l.map((item)=> {
         // item.tags = tags(item)
         return item
      }))
   }
   private static queryAndBind(sql:string,binds:any[]) {
      return this.getDB()
        .prepare(sql)
        .bind(...binds)
        .all<MagnetLink>()
        .then((r) => {
           if (!r.success||!r.results)
              throw new Error(r.error??"no results")
           return r.results
        })
   }
   private static getWhereSql(array:string[],column:string="hash") {
      if (array.length == 0) throw new Error("array is empty")
      if (array.length == 1) return ` ${column} = ?`
      let sql = ` ${column} IN (`
      for (let i = 0; i < array.length; i++) {
         sql += "?,"
      }
      sql = sql.slice(0, -1)
      sql += ")"
      return sql
   }

   static async *searchIMDB(query: string):AsyncGenerator<MagnetsIMDB|number> {
      let time = Date.now()
      // let debug = (s:string,u:boolean=true) => {
      //    let t = time
      //    if (u) time = Date.now()
      //    let deps= (time-t)
      //    if (!u) deps = Date.now()-time
      //    return `----> ${s} |in ${deps}ms;\n`;
      // }
      let r = await WebSearch.imdb(query)
      // yield debug("imdb search done")
      if (r.length == 0) {
         yield 0
         return
      }
      yield r.length

      // yield debug("not zero result starting to search magnets")
      let tasks:(Promise<Awaited<MagnetsIMDB>> & {stop?:boolean})[] = []
      for (const rI of r) {
         console.log("grepping "+rI.name+" results")
         // yield debug("grepping "+rI.name+" results")
         let imdb = rI as MagnetsIMDB
         imdb.magnets = []
         imdb.start = Date.now()
         let data = {
            stop:false,
            time:Date.now()
         }
         let searchName = getDbSearchString(rI.name.toLowerCase())
         console.log(`searching ${searchName}`);
         let search = this.searchByJson({
            name:searchName,
            year:imdb.year
         }).then((links:MagnetLink[])=> {
            if (links.length>8) {
               console.log("its too much"+` ${links.length} magnets for ${rI.name}`)
            }
            imdb.magnets = links
            race.stop = true
            // yield imdb
            return imdb
         }).catch((e) => {
            let error = e.stack || e.message || e.toString()
            console.error(error)
            // @ts-ignore
            // data.time = Date.now()
            imdb.error = e.message || e.toString()
            race.stop = true
              // yield imdb
            return imdb
         })
         let race: Promise<Awaited<MagnetsIMDB>> & {
            stop?: boolean
            // time?: number
         }  = Promise.race<MagnetsIMDB>([search, new Promise(async (resolve) =>
            setTimeout(() => {
               if (!data.stop) {
                  console.log("timeout "+rI.name)
                  race.stop = true
                  imdb.error = "timeout of a minute"
                  resolve(imdb)
               }
            }, 60 * 1000 )
         )])
         tasks.push(race)
      }

      while (tasks.length!=0) {
         for (const task of tasks) {
            // console.log("waiting for task",...tasks.map(e=>e.stop))
            // check if task is done
            if (task.stop) {
               let i = tasks.indexOf(task)
               yield await task
               // yield debug("done number of "+i+" cus "+(task.time-time),false)
               tasks.splice(tasks.indexOf(task), 1)
            }
            await new Promise((r) => setTimeout(r, 10))
         }
      }
      // let times = tasks.map(e=>e.time!)
      // yield debug("done "+times.length+" "+times.reduce((a,b)=>a+b,0)/times.length,false)
      // yield debug(`time details ${times.join(",")}`)
      yield Date.now()-time
   }
   static async searchByJson(json:SearchJson) {
      let sql = ""
      if (json.name) {
         sql = "select names.name as name, hash, dn, year, codec, quality, episode from names,magnets where names.id = magnets.name_id and "
      } else {
         sql = "select * from magnets where "
      }
      let condition=""
      if (json.useEqual) {
         condition = "="
      } else {
         condition = "like"
      }

      function updateConditionBy(column:string) {
         sql += `${column} ${condition} ? `
      }
      let args = Array<string | number>()

      function addArgs(s: string | number) {
         sql += "and "
         args.push(s)
      }
      json = validateArgs(json)
      console.log("searching by", json)
      if (json.name) {
         updateConditionBy("name")
         addArgs(getDbSearchString(json.name))
      }
      if (json.year) {
         sql += "year = ?"
         addArgs(json.year)
      }
      if (json.codec) {
         updateConditionBy("codec")
         addArgs(json.codec)
      }
      if (json.quality) {
         updateConditionBy("quality")
         addArgs(json.quality)
      }
      if (json.episode) {
         updateConditionBy("episode")
         addArgs(json.episode)
      }
      if (json.page) {
         sql = sql.trim()
         if (sql.endsWith("and")) {
            sql = sql.substring(0, sql.length - 3).trim()
         }
         const offset = (Number(json.page) - 1) * pageLimit
         sql += `limit ? offset ?`
         addArgs(pageLimit)
         addArgs(offset)
      }
      sql=sql.trim()
      if (sql.endsWith("where")) {
         throw new Error("no search params")
      }
      if (sql.length == 0) {
         throw new Error("sql is empty")
      }
      while (sql.endsWith("and")) {
         sql = sql.substring(0, sql.length - 3).trim()
      }
      console.log(sql," | args: ",...args)
      try {
         let result = await this.db.prepare(sql).bind(...args).all<MagnetLink>()
         if (!result.success) {
            let err = result.error
            let time = 0
            // @ts-ignore
            let msg = result.error?.message
            // @ts-ignore
            console.error(msg,err.stack,err)

            if (msg=="D1_ERROR") {
               while(!result.success && time < 5) {
                  time++
                  console.log("retry",time)
                  result = await this.db.prepare(sql).bind(...args).all<MagnetLink>()
               }
            }
         }
         if (!result.success) {
            // @ts-ignore
            throw result.error
         }
         return result.results.map((item) => {
            item.tags = tags(item)
            return item
         })
      } catch (e) {
         console.error(e)
         throw Error("database error")
      }
   }
}

const WebSearch = {
   imdb : async (query:string):Promise<IMDBTitled[]> => await fetch(
     `https://v3.sg.media-imdb.com/suggestion/titles/_/${query}.json`
   ).then((r) => {
      if (!r.ok) throw new Error(r.statusText);
      return r.json();
   }).then((r:any) => {
      console.log(r)
      let d = r.d
      if (!d||!(d instanceof Array))
         throw new Error("no d")
      if (d.length == 0) {
         return Array<IMDBTitled>(0) ;
      }
      let results:IMDBTitled[] = d.map((item:any) => {
         let image = item.i?.imageUrl??undefined
         return {
            name: item["l"],
            year: item["y"],
            titleId: item["id"],
            IMDBLink: `https://www.imdb.com/title/${item["id"]}/`,
            // type: item["qid"],
            poster: image,
            // actor: item["s"].split(",")
         }
      })
      return results
   })
}

export type IMDBTitled = {
   name: string|undefined
   year: string|undefined
   titleId: string|undefined
   IMDBLink: string|undefined
   poster: string|undefined
}
type MagnetDBResult = {
   magnets: MagnetLink[],
   error?: string
   start: number
}
export type MagnetsIMDB = IMDBTitled&MagnetDBResult


export type MagnetLink = {
   hash:string
   dn:string
   name?:string
   year?:string
   codec?:string
   quality?:string
   episode?:string
   name_id?:number
   tags?:string[]
}


export type SearchJson = {
   name?:string|undefined
   year?:string|undefined
   codec?:string|undefined
   quality?:string|undefined
   page?:string|undefined
   episode?:string|undefined
   useEqual?:boolean|undefined
}
export function validateArgs(json:SearchJson) {
   let checkTrim = (s:string|undefined|any,len = 1) => {
      if (s) {
         s = s.trim()
         if (s.length < len) {
            s = undefined
         }
      }
      return s
   }

   if (json.name) {
      json.name = checkTrim(json.name,3)
   }
   if (json.year) {
      json.year = json.year.toString()
      json.year = checkTrim(json.year,4)
      if (json.year?.length !=4 || isNaN(Number(json.year))) {
         throw new Error("year must be number and length is 4")
      }
   }

   if (json.codec) {
      json.codec = checkTrim(json.codec)
   }
   if (json.quality) {
      json.quality = checkTrim(json.quality)
   }
   if (json.page) {
      json.page = checkTrim(json.page)
      if (json.page?.length == 0 || isNaN(Number(json.page))) {
         json.page = "0"
      }
      if (Number(json.page) == 0) {
         json.page = undefined
      }
   }
   if (json.episode) {
      json.episode = checkTrim(json.episode)
   }
   if (!json.name && !json.year && !json.codec && !json.quality && !json.episode) {
      throw new Error("at least one param")
   }
   if((json.codec || json.quality || json.episode ) && !json.name ) {
      throw new Error("codec or quality or episode must be search with name")
   }
   return json
}

export function tags(magnet:MagnetLink) {
   let tags:string[] = []
   if (!magnet.dn)
      return tags
   let name = magnet.dn.toLowerCase()
   if (name.indexOf("h264") > 0) {
      tags.push("H264")
   }
   if (name.indexOf("h265") > 0) {
      tags.push("HEVC")
   }
   if (name.indexOf("x265") > 0) {
      tags.push("HEVC")
   }
   if (name.indexOf("HDR") > 0) {
      tags.push("HDR")
   }
   if (name.indexOf("UHD") > 0) {
      tags.push("UHD")
   }
   if (name.indexOf("10bit") > 0) {
      tags.push("10bit")
   }
   if (name.indexOf("aac") > 0) {
      tags.push("AAC")
   }
   if (name.indexOf("ac3") > 0) {
      tags.push("AC3")
   }
   if (name.indexOf("ddp5.1") > 0) {
      tags.push("DDP5.1")
   }
   return tags
}

class InvalidParamError extends Error {
   constructor(message?: string) {
      super(message)
      this.name = "InvalidParamError"
   }
}

