def annuity_payment(sum, rate, months):
    if months <= 0:
        raise ValueError("months must be positive")
    r = rate / 12 / 100
    if r == 0:
        return sum / months
    return sum * (r * (1 + r) ** months) / ((1 + r) ** months - 1)