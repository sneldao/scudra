// The request context — who is asking.
//
// Every case endpoint needs two things: the owner's key, and the fingerprint
// it corresponds to. Getting them in one place keeps the access rule in one
// place, so "is this request allowed to read this case" is answered the same
// way everywhere.

import type { APIContext } from "astro"
import { generateOwnerKey, hashOwnerKey, OWNER_COOKIE } from "../lib/owner.js"

export interface RequestOwner {
  /** The raw key from the cookie, or a freshly issued one. */
  key: string
  /** The fingerprint stored alongside each case. */
  hash: string
  /** True when this request had no key and one was just issued. */
  isNew: boolean
}

/**
 * The owner for this request.
 *
 * If the browser has no owner key yet, one is issued and set as an httpOnly
 * cookie. That is what makes the demo work for a first-time visitor: they
 * get their own key on their first request, and see only their own cases.
 *
 * The cookie is marked Secure only over HTTPS — a Secure cookie is dropped
 * on http://localhost in some browsers, which would quietly break local
 * development.
 */
export function requestOwner(cookies: APIContext["cookies"], url: URL): RequestOwner {
  const existing = cookies.get(OWNER_COOKIE)?.value
  if (existing && existing.length >= 20) {
    return { key: existing, hash: hashOwnerKey(existing), isNew: false }
  }
  const key = generateOwnerKey()
  cookies.set(OWNER_COOKIE, key, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: url.protocol === "https:",
    maxAge: 60 * 60 * 24 * 365,
  })
  return { key, hash: hashOwnerKey(key), isNew: true }
}
