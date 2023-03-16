describe('npm-burst', () => {
  beforeEach(() => cy.visit('/npm-burst'));

  it('should display package name', () => {
    cy.get('h1').contains('NPM Downloads for nx');
  });

  it('should update package name when updating dropdown', () => {
    cy.get('input[type=text]').clear().type('typescript{enter}');
    cy.get('h1').contains('NPM Downloads for typescript');
  });

  it('should pull package name from browser query params', () => {
    cy.visit('/npm-burst?package=typescript');
    cy.get('h1').contains('NPM Downloads for typescript');
  });
});
