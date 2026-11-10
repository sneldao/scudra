# The Cloud Agent Manifesto

The next shift in software is not bigger models. It is smaller, cloud-native agents.

## From local to cloud

For decades, we ran software on our own machines. Then we rented servers in the cloud. Then we moved to functions and containers. Each shift made compute more abstract, more elastic, more ephemeral.

Now we are entering the agent era. Agents browse the web, run code, operate desktops, and make decisions. But the best agents are not the ones that run on your laptop. They are the ones that spawn in the cloud, act from a residential proxy, and vanish when the task is done.

## What is a cloud agent?

A cloud-native agent is a program whose body is infrastructure. It can be a browser in Frankfurt, a sandbox in Iowa, or a desktop in Singapore. It starts with an API call and leaves no persistent state behind. It is the right shape for a world where trust is scarce and attention is expensive.

Every cloud agent is built from three primitives:

- **Browser** — sees the public web.
- **Sandbox** — runs code safely.
- **Desktop** — manipulates interfaces built for humans.

Together they cover almost every automated task a person can do online.

## Why ephemerality matters

An agent that persists is an agent that can be profiled. Its IP becomes reputation. Its browser fingerprint becomes identity. Its storage becomes liability. Ephemerality is not just a security feature; it is a design principle.

When an agent is born, acts, and dies in the same request, the investigation leaves with it. This changes what is possible: competitive research without retaliation, sensitive data without custody, automated operations without attribution.

### The refinement: whose persistence?

We got this half right for a long time, and building a real product forced the correction.

Ephemerality is a claim about **the operator**. The infrastructure that acts on someone's behalf must leave no trace — no IP, no fingerprint, no log, no correlation between this task and the next. That is the whole thesis, and it is not negotiable.

It is **not** a claim about the user's own conclusions. An investigator who assembles a subject's footprint needs to keep it, hand it to someone, and have it checkable long after the sandbox that gathered it has been destroyed. "No trace" must mean _no trace on the target_, not _no record for the user_.

Getting this backwards in either direction is fatal. Keep everything and you are a surveillance archive; keep nothing and you are a demo. The line runs between what was learned **about a subject** and what the investigator **concluded from it**.

That distinction — and a signed, independently checkable record of the conclusion — is what the product is built on.

## Solari and Scudra

Solari is the platform that makes these primitives one API.

Scudra is the lab that shows what they can do — and, underneath the lab, the product that proves it.

## What we are building

Scudra is a living cookbook: every recipe is a real, runnable agent, every experience is a demonstration of what cloud agents can do, every essay argues for a world where software is no longer bound to a single machine.

Underneath the cookbook there is one product. **Blindspot**: evidence gathering that leaves the investigator invisible, delivered as a signed record anyone can check.

We are not trying to replace developers. We are trying to give them a new primitive: the agent as a first-class building block of the internet.
