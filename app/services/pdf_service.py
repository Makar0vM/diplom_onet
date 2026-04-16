from jinja2 import Template


def generate_contract(name, amount):
    template = Template("""
    <h1>Договор займа</h1>
    <p>Компания: {{ name }}</p>
    <p>Сумма: {{ amount }}</p>
    """)
    return template.render(name=name, amount=amount)