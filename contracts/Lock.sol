// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

contract Lock {
    uint public unlockTime;
    address payable public owner;

    // Changed to match test expectations (removed the 'when' parameter)
    event Withdrawal(address indexed to, uint amount);

    constructor(uint _unlockTime) payable {
        require(
            block.timestamp < _unlockTime,
            "Unlock time should be in the future"
        );
        unlockTime = _unlockTime;
        owner = payable(msg.sender);
    }

    function withdraw() public {
        require(block.timestamp >= unlockTime, "You can't withdraw yet");
        require(msg.sender == owner, "You aren't the owner");
        
        // Updated event emission to match the modified event signature
        emit Withdrawal(msg.sender, address(this).balance);
        
        owner.transfer(address(this).balance);
    }
}
