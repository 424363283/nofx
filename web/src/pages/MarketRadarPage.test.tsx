// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import useSWR from 'swr'
import { MarketRadarPage, RadarCard, type RadarItem } from './MarketRadarPage'
vi.mock('swr',()=>({default:vi.fn()}))
vi.mock('../contexts/AuthContext',()=>({useAuth:()=>({user:null,logout:vi.fn()})}))
vi.mock('../contexts/LanguageContext',()=>({useLanguage:()=>({language:'zh',setLanguage:vi.fn()})}))
afterEach(()=>{cleanup();vi.clearAllMocks()})
const base:RadarItem={symbol:'BTCUSDT',category:'crypto',price:100,change_24h:1,quote_volume:10000,price_as_of:new Date().toISOString(),candle_at:new Date().toISOString(),change:0,volume_ratio:1,dif:0,dea:0,histogram:0,macd:'持平',bias:'neutral',signals:[],notes:[],bull:0,bear:0}
function data(items:RadarItem[],extra={}){vi.mocked(useSWR).mockReturnValue({data:{result:{items,as_of:new Date().toISOString(),scanned:items.length,analyzed:items.length,eligible:items.length,warnings:[]},scanning:false},mutate:vi.fn(),...extra} as any)}
async function choose(label:string,option:string){
 fireEvent.mouseDown(screen.getByLabelText(label))
 await waitFor(()=>{const el=Array.from(document.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option-content')).find(x=>x.textContent===option);expect(el).toBeTruthy();fireEvent.click(el!)})
}
it('keeps missing values distinct from zero and exposes indicator evidence',()=>{
 render(<RadarCard item={base}/>);
 expect(screen.getByText('0.00%')).toBeTruthy();expect(screen.getByText('—')).toBeTruthy()
 fireEvent.click(screen.getByText('指标与判断依据 · MACD 持平'))
 expect(screen.getByText('0.0000 / 0.0000 / 0.0000')).toBeTruthy()
 expect(screen.getByText(/不是胜率/)).toBeTruthy()
})
it('filters Ant table results by signal, search and direction',async()=>{
 data([{...base,symbol:'ETHUSDT',bias:'bull',signals:[{kind:'macd',label:'MACD 金叉',direction:'bull'}]},base,{...base,symbol:'SOLUSDT',bias:'bear',signals:[{kind:'oi',label:'持仓量减少',direction:'neutral'}]}]);render(<MarketRadarPage/>);
 expect(screen.queryByText('BTCUSDT')).toBeNull()
 await choose('信号筛选','MACD 金叉／死叉')
 expect(screen.getByText('ETHUSDT')).toBeTruthy();expect(screen.queryByText('SOLUSDT')).toBeNull()
 await choose('信号筛选','全部信号');fireEvent.click(screen.getByLabelText('仅看异动'))
 fireEvent.change(screen.getByLabelText('搜索合约'),{target:{value:'btc'}})
 expect(screen.getByText('BTCUSDT')).toBeTruthy()
 await choose('方向筛选','偏空线索');expect(screen.queryByText('BTCUSDT')).toBeNull()
 expect(screen.getByText(/当前筛选下没有匹配结果/)).toBeTruthy()
})
it('retains the stale-result warning on connection failure',()=>{
 data([base],{error:new Error('服务连接失败')});render(<MarketRadarPage/>);
 expect(screen.getByRole('alert').textContent).toContain('保留上次结果')
})
it('filters equities without losing the crypto universe',async()=>{
 data([base,{...base,symbol:'TSLAUSDT',category:'equity',bias:'bull',signals:[{kind:'macd',label:'MACD 金叉',direction:'bull'}]}]);render(<MarketRadarPage/>);
 fireEvent.click(screen.getByLabelText('仅看异动'))
 await choose('资产分类','美股／ETF（1）')
 expect(screen.getByText('TSLAUSDT')).toBeTruthy();expect(screen.queryByText('BTCUSDT')).toBeNull()
 await choose('资产分类','全部资产（2）');expect(screen.getByText('BTCUSDT')).toBeTruthy()
})
