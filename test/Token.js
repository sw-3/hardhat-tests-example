const { expect } = require('chai');
const { ethers } = require('hardhat');

const tokens = (n) => {
    return ethers.parseUnits(n.toString(), 'ether')
}

describe('Token', ()=> {
    let token, accounts, deployer, receiver, exchange, sender

    beforeEach(async () => {
        // fetch Token from blockchain
        const Token = await ethers.getContractFactory('Token')
        token = await Token.deploy('ScottW3 Token', 'SW3T', '100000000')

        // fetch accounts
        accounts = await ethers.getSigners()
        deployer = accounts[0]
        receiver = accounts[1]
        exchange = accounts[2]
        sender = accounts[3]
    })

    describe('Deployment', () => {
        const name = 'ScottW3 Token'
        const symbol = 'SW3T'
        const decimals = 18
        const totalSupply = tokens('100000000')

        it('has correct name', async ()=> {
            expect(await token.name()).to.equal(name)
        })

        it('has correct symbol', async ()=> {
            expect(await token.symbol()).to.equal(symbol)
        })

        it('has correct decimals', async ()=> {
            expect(await token.decimals()).to.equal(decimals)
        })

        it('has correct totalSupply', async ()=> {
            expect(await token.totalSupply()).to.equal(totalSupply)
        })

        it('assigns total supply to deployer', async ()=> {
            expect(await token.balanceOf(deployer.address)).to.equal(totalSupply)
        })

    })

    describe('Sending Tokens', () => {
        let amount, transaction, filter, events

        describe('Success', () => {

            beforeEach(async () => {
                amount = tokens(100)
                transaction = await token.connect(deployer).transfer(receiver.address, amount)
                await transaction.wait()
            })

            it('transfers token balances', async () => {
                // ensure that tokens were transfered (balance changed)
                expect(await token.balanceOf(deployer.address)).to.equal(tokens(99999900))
                expect(await token.balanceOf(receiver.address)).to.equal(amount)
            })

            it('emits Transfer event', async () => {
                filter = token.filters.Transfer
                events = await token.queryFilter(filter, -1)
                const event = events[0]

                expect(event.fragment.name).to.equal('Transfer')

                const args = event.args
                expect(args.from).to.equal(deployer.address)
                expect(args.to).to.equal(receiver.address)
                expect(args.value).to.equal(amount)
            })

        })

        describe('Failure', () => {

            it('rejects insufficient balances', async () => {
                const invalidAmount = tokens(1000000000)        // 1 billion
                await expect(token.connect(deployer).transfer(receiver.address, invalidAmount)).to.be.reverted
            })

            it('rejects invalid recipient', async () => {
                amount = tokens(100)
                await expect(token.connect(deployer).transfer('0x0000000000000000000000000000000000000000', amount)).to.be.reverted
            })

        })

    })

    describe('Approving Tokens', () => {
        let amount, transaction, filter, events

        beforeEach(async () => {
                amount = tokens(80)
                transaction = await token.connect(deployer).approve(exchange.address, amount)
                await transaction.wait()
        })

        describe('Success', () => {

            it('allocates an allowance for delegated token spending', async () => {
                expect(await token.allowance(deployer.address, exchange.address)).to.equal(amount)
            })

            it('emits Approval event', async () => {
                filter = token.filters.Approval
                events = await token.queryFilter(filter, -1)
                const event = events[0]

                expect(event.fragment.name).to.equal('Approval')

                const args = event.args
                expect(args.owner).to.equal(deployer.address)
                expect(args.spender).to.equal(exchange.address)
                expect(args.value).to.equal(amount)
            })

        })

        describe('Failure', () => {

            it('rejects invalid spenders', async () => {
                await expect(token.connect(deployer).approve('0x0000000000000000000000000000000000000000', amount)).to.be.reverted
            })
        })

    })


    describe('Delegated Token Transfers', () => {
        let amount, transaction, filter, events

        beforeEach(async () => {
            amount = tokens(100)
            transaction = await token.connect(deployer).approve(exchange.address, amount)
            await transaction.wait()
        })

        describe('Success', () => {
            // the transaction scenario is the exchange transfers from deployer to receiver
            beforeEach(async () => {
                transaction = await token.connect(exchange).transferFrom(deployer.address, receiver.address, amount)
                await transaction.wait()
            })

            it('transfers token balances', async () => {
                expect(await token.balanceOf(deployer.address)).to.be.equal(ethers.parseUnits('99999900', 'ether'))
                expect(await token.balanceOf(receiver.address)).to.be.equal(amount)
            })

            it('resets the allowance', async () => {
                expect(await token.allowance(deployer.address, exchange.address)).to.equal(0)
            })

            it('emits Transfer event', async () => {
                filter = token.filters.Transfer
                events = await token.queryFilter(filter, -1)
                const event = events[0]

                expect(event.fragment.name).to.equal('Transfer')

                const args = event.args
                expect(args.from).to.equal(deployer.address)
                expect(args.to).to.equal(receiver.address)
                expect(args.value).to.equal(amount)
            })

        })

        describe('Failure', () => {
            let senderBalance, approveAmount, transaction, result

            beforeEach(async () => {

                // sender account gives approval for 300 tokens
                approveAmount = tokens(300)
                transaction = await token.connect(sender).approve(exchange.address, approveAmount)
                result = await transaction.wait()
            })

            it('rejects insufficient balances', async () => {
                // set up the 'sender' address, with only 200 tokens
                senderBalance = tokens(200)
                transaction = await token.connect(deployer).transfer(sender.address, senderBalance)
                result = await transaction.wait()

                // try to spend 201, which is approved but not enough balance
                const invalidAmount = tokens(201)
                await expect(token.connect(exchange).transferFrom(sender.address, receiver.address, invalidAmount)).to.be.reverted
            })

            it('rejects insufficient approval amount', async () => {
                // set up the 'sender' address, with 500 tokens
                senderBalance = tokens(500)
                transaction = await token.connect(deployer).transfer(sender.address, senderBalance)
                result = await transaction.wait()

                // try to spend 301, which is not approved even though sufficient balance
                const notApprovedAmount = tokens(301)
                await expect(token.connect(exchange).transferFrom(sender.address, receiver.address, notApprovedAmount)).to.be.reverted
            })

        })

    })

})
