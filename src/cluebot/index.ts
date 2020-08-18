import { 
  sendMessage, 
  getRandomItemFromList, 
  getRandomItemFromEnum, 
  filterEnumValuesInSting,
  getRandomItemFromListOtherThan
} from '../utils'
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
  HasAccused,
}

export class Cluebot implements Bot {
  botName: string
  address: string
  maxGuesses: number
  maxInvestigations: number
  truth: Crime
  status: Map<string, NodeStates>
  guesses: Map<string, number>
  investigations: Map<string, number>
  isWinner: Map<string, boolean>
  bountyMode: boolean
  totalBountyCount: number
  bountyAmount: number

  constructor(
    address: string, 
    bountyMode: boolean=false, 
    totalBountyCount: number=0,
    bountyAmount: number=0
  ) {
    this.address = address
    this.botName = '🕵️  Mysterybot'
    this.bountyMode = bountyMode
    this.totalBountyCount = totalBountyCount
    this.bountyAmount = bountyAmount
    this.truth = new Crime(
      getRandomItemFromEnum(Killer),
      getRandomItemFromEnum(Weapon),
      getRandomItemFromEnum(Room)
    )
    console.log(`${this.botName} has been added`)
    this.maxGuesses = 5
    this.maxInvestigations = 3
    this.status = new Map<string, NodeStates>()
    this.guesses = new Map<string, number>()
    this.investigations = new Map<string, number>()
    this.isWinner = new Map<string, boolean>()
    // Uncomment to log the result while debugging
    console.log('Crime:' + this.truth.statement())
  }

  async handleMessage(message: IMessage) {
    console.log(`${this.botName} <- ${message.from}: ${message.text}`)
    if (!this.status.has(message.from)) return this.handleNew(message)
    const state = this.status.get(message.from)
    
    if (message.text.substring(0, 5) === 'Rules') this.handleRules(message)
    else if(message.text.substring(0, 7) == 'Winners') this.handleWinners(message)
    else if(message.text.substring(0, 5) == 'Guess') this.handleGuess(message)
    else if(message.text.substring(0, 6) == 'Accuse') {
      if (state == NodeStates.HasAccused) this.handleHasAccused(message)
      else this.handleAccuse(message)
    }
    else if(message.text.substring(0, 11) == 'Investigate') this.handleInvestigate(message)
    else if(message.text.substring(0, 4) == 'Help') this.handleHelp(message)
    else this.handleUnknown(message)
  }

  handleUnknown(message) {
    return sendMessage(message.from, {
        from: this.address,
        text: getRandomItemFromList(response['randomSentence']),
    })
  }

  handleAccuse(message) {
    let text = ''
    if (this.bountyMode) {
      // get tweet and that bullshit
    } else {
      text = message.text.toLowerCase()
    }
    const guess = this.parseGuess(text)
    if (guess.isGuess) {
      this.status.set(message.from, NodeStates.HasAccused)
      if (guess.isKillerCorrect && guess.isWeaponCorrect && guess.isRoomCorrect) {
        this.isWinner.set(message.from, true)
        this.handlePay(message)
      } else {
        sendMessage(message.from, {
            from: this.address,
            text: getRandomItemFromList(response['incorrectAccuse'])
        })
      }
    } else {
      sendMessage(message.from, {
        from: this.address,
        text: getRandomItemFromList(response['inclompleteAccuse'])
      })
    }
  }

  handleGuess(message) {
    const guess = this.parseGuess(message.text.toLowerCase())
    let reply: string
    if (guess.isValid) {
      const guessCnt = this.guesses.get(message.from)
      if (guessCnt >= this.maxGuesses)
        reply = getRandomItemFromList(response['outOfGuesses'])
      else {
        this.guesses.set(message.from, guessCnt + 1)
        if(guess.isKillerCorrect && guess.isWeaponCorrect && guess.isRoomCorrect) {
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

  handleInvestigate(message: IMessage) {
    let investigationCnt = this.investigations.get(message.from)
    if (investigationCnt < this.maxInvestigations) {
      this.investigations.set(message.from, investigationCnt + 1)
      const phrase = message.text.toLowerCase()
      const isRoomCorrect = phrase.includes(this.truth.room)
      let reply = isRoomCorrect ? response['successInvestigate'] : response['failInvestigate']
      const randomWeapon = getRandomItemFromListOtherThan(Object.keys(Weapon), [Weapon[this.truth.weapon]])
      const randomKiller = getRandomItemFromListOtherThan(Object.keys(Killer), [Weapon[this.truth.killer]])
      sendMessage(message.from, {
          from: this.address,
          text: reply + `. Eliminate ${randomKiller} and ${randomWeapon}`,
      })
    } else {
      sendMessage(message.from, {
          from: this.address,
          text: getRandomItemFromList(response['outOfInvestigataion']),
      })
    }
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
    this.investigations.set(message.from, 0)
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

  handleHasAccused(message: IMessage) {
    if (this.isWinner.get(message.from)) {
      sendMessage(message.from, {
          from: this.address,
          text: getRandomItemFromList(response['hasWon']),
      })
    } else {
      sendMessage(message.from, {
          from: this.address,
          text: getRandomItemFromList(response['hasFailed']),
      })
    }
  }

  handleRules(message: IMessage) {
    const guessCnt = this.maxGuesses - this.guesses.get(message.from)
    const investigationCnt = this.maxInvestigations - this.investigations.get(message.from)
    const hasAccused = this.status.has(message.from) && this.status.get(message.from) == NodeStates.HasAccused
    const accusedCnt = hasAccused ? 0 : 1
    sendMessage(message.from, {
      from: this.address,
      text: `You have ${guessCnt} guesses, ${investigationCnt} investigations, ${accusedCnt} accussitions`,
    })  
  }

  handleWinners(message: IMessage) {
    let winnerList = Array.from(this.isWinner.keys())
    sendMessage(message.from, {
      from: this.address,
      text: 'Winner list is as follows: ' + winnerList.join(', '),
    }) 
  }

  async handlePay(message) {
    if (this.bountyMode && Object.keys(this.isWinner).length <= this.totalBountyCount) {
      const payUrl = await payDai(10.0) 
      console.log(`Payment link generated: ${payUrl}`)
      sendMessage(message.from, {
        from: this.address,
        text: response['payment'] + payUrl
      })
    } else {
      sendMessage(message.from, {
        from: this.address,
        text: response['noPayment']
      })
    } 
  }
}
