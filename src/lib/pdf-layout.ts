export type PositionedPdfText = {
  str: string
  transform: Array<unknown>
  hasEOL: boolean
}

export function groupPdfTextRows(items:PositionedPdfText[]){
  const positioned=items
    .filter(item=>item.str.trim())
    .map(item=>({x:Number(item.transform[4]??0),y:Number(item.transform[5]??0),text:item.str.trim()}))
  const datePattern=/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/
  const anchors=positioned.filter(item=>datePattern.test(item.text)).sort((a,b)=>b.y-a.y)
  if(anchors.length){
    return anchors.map((anchor,index)=>{
      const previous=anchors[index-1]
      const next=anchors[index+1]
      const typicalGap=Math.abs((previous?.y??anchor.y+24)-(next?.y??anchor.y-24))/2||24
      const upper=previous?(previous.y+anchor.y)/2:anchor.y+typicalGap/2
      const lower=next?(anchor.y+next.y)/2:anchor.y-typicalGap/2
      return positioned
        .filter(item=>item.y<=upper&&item.y>lower)
        .sort((a,b)=>a.x-b.x||b.y-a.y)
        .map(item=>item.text)
        .join(' ')
    }).join('\n')
  }
  const rows=new Map<number,Array<{x:number;text:string}>>()
  for(const item of positioned){
    const y=Math.round(item.y/3)*3
    rows.set(y,[...(rows.get(y)??[]),{x:item.x,text:item.text}])
  }
  return Array.from(rows.entries())
    .sort((a,b)=>b[0]-a[0])
    .map(([,parts])=>parts.sort((a,b)=>a.x-b.x).map(part=>part.text).join(' '))
    .join('\n')
}
