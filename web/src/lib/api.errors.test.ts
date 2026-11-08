// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest'
import {api} from './api'
import type {CreateTraderRequest} from '../types'
afterEach(()=>vi.unstubAllGlobals())
it('preserves the backend validation reason',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false,status:400,json:async()=>({error:'候选数量必须为 1–20'})}))
 await expect(api.createTrader({} as CreateTraderRequest)).rejects.toThrow('候选数量必须为 1–20')
})
it('normalizes legacy null positions and preserves the account observation timestamp', async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,headers:new Headers({'X-Positions-As-Of':'1794140000000'}),json:async()=>null}))
 await expect(api.getPositionsSnapshot('a')).resolves.toEqual({positions:[],asOf:1794140000000})
})
