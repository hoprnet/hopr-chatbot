import { sendMessage, getRandomItemFromList, getRandomItemFromEnum, filterEnumValuesInSting } from '../utils'
import { IMessage } from '../message'
import { ListenResponse } from '@hoprnet/hopr-protos/node/listen_pb'
import { Bot } from '../bot'
import { payDai } from '../linkdrop'
import response from './response.json'

enum Killer {
  Plum = 'plum',
  Mustard = 'mustard',
  Green = 'green',
  White = 'white',
  Scarlett = 'scarlett',
  Peacock = 'peacock'
}

enum Weapon {
  Candlestick = 'candlestick',
  Dagger = 'dagger',
  Lead_Pipe = 'lead pipe',
  Revolver = 'revolver',
  Rope = 'rope',
  Spanner = 'spanner'
}

enum Room {
  Kitchen = 'kitchen',
  Conservatory = 'conservatory',
  Library = 'library',
  Dinning = 'dinning',
  Ballroom = 'ballroom',
  Hall = 'hall',
  Study = 'study',
  Lounge = 'lounge',
  Billiard = 'billiard'
}

class Crime {
  killer: Killer
  weapon: Weapon
  room: Room

  constructor(killer: Killer, weapon: Weapon, room: Room) {
    this.killer = killer
    this.weapon = weapon
    this.room = room
  }

  statement(): string {
    return `${this.killer} killed at the ${this.room} using the ${this.weapon}!`
  }
}

enum NodeStates {
  IsGuessing,
  HasGuessed,
}

export class Cluebot implements Bot{
  botName: string
  address: string
  reply: string
  maxGuesses: number
  truth: Crime
  status: Map<string, NodeStates>
  guesses: Map<string, number>

  constructor(address: string) {
    this.address = address
    this.botName = '🕵️  Cluebot'
    this.truth = new Crime(
      getRandomItemFromEnum(Killer),
      getRandomItemFromEnum(Weapon),
      getRandomItemFromEnum(Room)
    )
    console.log(`${this.botName} has been added`)
    this.maxGuesses = 5
    this.status = new Map<string, NodeStates>()
    this.guesses = new Map<string, number>()
    // Uncomment to log the result while debugging
    console.log('Crime:' + this.truth.statement())
  }

  async handleMessage(message: IMessage) {
    console.log(`${this.botName} <- ${message.from}: ${message.text}`)
    if (!this.status.has(message.from)) return this.handleNew(message)
    const state = this.status.get(message.from)
    if (state == NodeStates.HasGuessed) return this.handleGuessed(message)
    else {
      const phrase = message.text.toLowerCase()
      if (phrase.includes('help')) return this.handleHelp(message)
      else {
        const guess = this.parseGuess(phrase)
        if (guess.isGuess) return this.handleGuess(message, guess)
        else {
          return sendMessage(message.from, {
              from: this.address,
              text: getRandomItemFromList(response['randomSentence']),
          })
        }
      }
    }
  }

  handleGuess(message, guess) {
    let reply: string
    if(guess.negation) reply = getRandomItemFromList(response['randomSentence'])
    else if (guess.isValid) {
      const guessCnt = this.guesses.get(message.from)
      if (guessCnt >= this.maxGuesses)
        reply = getRandomItemFromList(response['outOfGuesses'])
      else {
        this.guesses.set(message.from, guessCnt + 1)
        if(guess.isKillerCorrect && guess.isWeaponCorrect && guess.isRoomCorrect) {
          return this.handleWinner(message)
          reply = getRandomItemFromList(response['correctComplete'])
        } 
        else if(!guess.isKillerCorrect && !guess.isWeaponCorrect && !guess.isRoomCorrect) 
          reply = getRandomItemFromList(response['wrongComplete'])
        else {
          if (guess.isKillerCorrect) reply = getRandomItemFromList(response['knowsKiller'])
          else reply = getRandomItemFromList(response['wrongKiller'])

          if (guess.isWeaponCorrect) reply = reply + '; ' + getRandomItemFromList(response['knowsWeapon'])
          else reply = reply + '; ' + getRandomItemFromList(response['wrongWeapon'])

          if (guess.isRoomCorrect) reply = reply + ' and' + getRandomItemFromList(response['knowsRoom'])
          else reply = reply + ' and' + getRandomItemFromList(response['wrongRoom'])
        }
      }
    } else {
      if (guess.missedKiller) reply = getRandomItemFromList(response['missedKiller'])
      else if (guess.missedWeapon) reply = getRandomItemFromList(response['missedWeapon'])
      else if (guess.missedRoom) reply = getRandomItemFromList(response['missedRoom'])
      else reply = getRandomItemFromList(response['falseGuess'])
    }
    return sendMessage(message.from, {
        from: this.address,
        text: reply,
    })
  }

  parseGuess(phrase: string) {
    const haskillers = filterEnumValuesInSting(phrase, Killer)
    const hasWeapons = filterEnumValuesInSting(phrase, Weapon)
    const hasRooms = filterEnumValuesInSting(phrase, Room)
    return {
      isGuess: haskillers.length > 0 || hasWeapons.length > 0 && hasRooms.length > 0,
      isValid: haskillers.length == 1 && hasWeapons.length == 1 && hasRooms.length == 1,
      missedKiller: haskillers.length == 0,
      missedRoom: hasRooms.length == 0,
      missedWeapon: hasWeapons.length == 0,
      isKillerCorrect: phrase.includes(this.truth.killer),
      isWeaponCorrect: phrase.includes(this.truth.weapon),
      isRoomCorrect: phrase.includes(this.truth.room),
      negation: filterEnumValuesInSting(phrase, ['not', "n't"]).length > 0
    }
  }

  handleNew(message: IMessage) {
    const rules0 = response['rulesLines'].slice(0, 3).join('\n')
    const rules1 = response['rulesLines'].slice(3).join('\n')
    sendMessage(message.from, {
        from: this.address,
        text: ' Seems like you are the new detective! Let me introduce you to the crime scene\n' + rules0,
    })
    sendMessage(message.from, {
        from: this.address,
        text: rules1,
    })
    this.status.set(message.from, NodeStates.IsGuessing)
    this.guesses.set(message.from, 0)
  }

  handleHelp(message: IMessage) {
    const rules0 = response['rulesLines'].slice(0, 3).join('\n')
    const rules1 = response['rulesLines'].slice(3).join('\n')
    sendMessage(message.from, {
        from: this.address,
        text: rules0,
    })
    sendMessage(message.from, {
        from: this.address,
        text: rules1,
    })
  }

  handleGuessed(message: IMessage) {
    sendMessage(message.from, {
        from: this.address,
        text: getRandomItemFromList(response['guessed']),
    })
  }

  async handleWinner(message) {
    this.status.set(message.from, NodeStates.HasGuessed)
    const payUrl = await payDai(10.0) 
    console.log(`Payment link generated: ${payUrl}`)
    sendMessage(message.from, {
      from: this.address,
      text: response['winner'] + payUrl
    })
  }
}
