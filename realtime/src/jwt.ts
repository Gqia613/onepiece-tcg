// Pages 側の functions/_lib/jwt.js（HS256・Web Cryptoのみ・依存なし）を realtime からも共用する。
// wrangler(esbuild) は相対パスでリポジトリ内の別ディレクトリをバンドルできる。
// @ts-ignore JSモジュール（型は下で付与）
import { verifyJWT as _verify, signJWT as _sign } from '../../functions/_lib/jwt.js';

export interface MatchTokenPayload {
  uid: number | string;
  un: string;      // username
  scope?: string;  // 'match' を要求
  iat?: number;
  exp?: number;
}

export const verifyJWT = _verify as (token: string, secret: string) => Promise<MatchTokenPayload | null>;
export const signJWT = _sign as (payload: object, secret: string, ttlSec?: number) => Promise<string>;
