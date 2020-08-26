import { sendMessage } from '../utils'
import Web3 from 'web3';
import { Bot } from '../bot'
import { IMessage } from '../message'
import { TweetMessage, TweetState } from '../twitter'
//@TODO: Isolate these utilities to avoid importing the entire package
import { convertPubKeyFromB58String, u8aToHex } from '@hoprnet/hopr-utils'
import { Utils } from '@hoprnet/hopr-core-ethereum'


enum NodeStates {
  newUnverifiedNode = 'UNVERIFIED',
  tweetVerificationFailed = 'FAILED_TWITTER_VERIFICATION',
  tweetVerificationSucceeded = 'SUCCEEDED_TWITTER_VERIFICATION'
}

enum BotCommands {
  rules,
  status
}

const BotResponses = {
  [BotCommands.rules]: `\n
    Welcome to the xHOPR incentivized network.

    To participate, please follow these instructions:
    1. Post a tweet with your HOPR Address and the tag #HOPRNetwork
    2. Load 10 xDAI into your HOPR Ethereum Address
    3. Send me the link to your tweet (don‘t delete it!)
    4. Keep your tweet and node alive, and I'll slowly send xHOPR to you.
    
    For more information, go to https://cover.hoprnet.org
  `,
  [BotCommands.status]: (status: NodeStates) => `\n
    Your current status is: ${status}
  `
}

const NodeStateResponses = {
  [NodeStates.newUnverifiedNode]: BotResponses[BotCommands.rules],
  [NodeStates.tweetVerificationFailed]: (tweetStatus: TweetState) => `\n
    Your tweet has failed the verification. Please make sure to follow the rules.

    Here is the current status of your tweet:
    1. Tagged @hoprnet: ${tweetStatus.hasMention}
    2. Used #HOPRNetwork: ${tweetStatus.hasTag}
    3. Includes your node: ${tweetStatus.sameNode}

    Please try again with a different tweet.
  `
}

export class Coverbot implements Bot {
  botName: string
  address: string
  timestamp: Date
  status: Map<string, NodeStates>
  tweets: Map<string, TweetMessage>
  twitterTimestamp: Date

  constructor(address: string, timestamp: Date, twitterTimestamp: Date) {
    this.address = address
    this.timestamp = timestamp
    this.status = new Map<string, NodeStates>()
    this.tweets = new Map<string, TweetMessage>()
    this.twitterTimestamp = twitterTimestamp
    this.botName = '💰 Coverbot'
    console.log(`${this.botName} has been added`)
  }

  protected _sendMessageFromBot(recipient, message) {
    return sendMessage(recipient, {
      from: this.address,
      text: message,
    })
  }

  protected async _parseMessage(message: IMessage): Promise<NodeStates> {
    if (message.text.match(/https:\/\/twitter.com.*?$/i)) {

      const tweet = new TweetMessage(message.text)
      this.tweets.set(message.from, tweet)

      //@TODO: Remove mock for production to ensure we process tweets.
      /*
      * Careful, it seems that the twitter API truncates some of the text
      * content, so if something isn't in the first 100 characters, it might
      * be left out of the parser.
      */
      await tweet.fetch({ mock: true })

      if (tweet.hasTag('hoprnetwork')) {
        tweet.status.hasTag = true
      }
      if(tweet.hasMention('hoprnet')) {
        tweet.status.hasMention = true
      }
      if(tweet.hasSameHOPRNode(message.from)) {
        tweet.status.sameNode = true
      }

      if (tweet.status.isValid()) {
        const pubkey = await convertPubKeyFromB58String(message.from)
        const nodeEthereumAddress = u8aToHex(await Utils.pubKeyToAccountId(pubkey.marshal()))
        const xdaiWeb3 = new Web3(new Web3.providers.HttpProvider('https://dai.poa.network'));
        const balance = await xdaiWeb3.eth.getBalance(nodeEthereumAddress)

        //@TODO: Move this to an environment variable or read from a contract
        const XDAI_THRESHOLD = 1
        console.log(`The xDAI balance of the ${nodeEthereumAddress} is ${Web3.utils.fromWei(balance)}`)

        return NodeStates.tweetVerificationSucceeded
      } else {
        return NodeStates.tweetVerificationFailed
      }
    }
    return NodeStates.newUnverifiedNode;
  }

  async handleMessage(message: IMessage) {
    console.log(`${this.botName} <- ${message.from}: ${message.text}`)
    const nodeState = await this._parseMessage(message);

    switch(nodeState) {
      case NodeStates.newUnverifiedNode:
        this._sendMessageFromBot(message.from, NodeStateResponses[nodeState])
        break;
      case NodeStates.tweetVerificationFailed:
        this._sendMessageFromBot(message.from, NodeStateResponses[nodeState](this.tweets.get(message.from).status))
    }
    this._sendMessageFromBot(message.from, BotResponses[BotCommands.status](nodeState))
  }
}