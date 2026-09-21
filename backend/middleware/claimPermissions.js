
const preventSelfApproval = async (req, res, next) => {
    const claim = await claim.findById(req.params.claimId);
    if (!claim) {
        return res.status(404).json({ error: 'Claim not found.' });
    }

    // Rule: a user cannot approve their own claim
    if (claim.employee.toString() === req.user.id.toString()) {
        return res.status(403).json({ error: "Forbidden: You cannot approve your own claim." });
    }

    req.claim = claim; // Attach the claim to the request object for further use
    next();
};

module.exports = preventSelfApproval;