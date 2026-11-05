package com.tvdoguh.bridge;

import org.junit.Test;
import java.util.Arrays;
import static org.junit.Assert.*;

public class TextPlanTest {
 @Test public void plansFullNameAndReplacesPreviousSearch(){assertEquals(Arrays.asList("limpar","o","s","espaço","s","i","m","p","s","o","n","s"),TextPlan.saimo("Os Simpsons"));}
 @Test public void normalizesAccentsAndWhitespaceForTheAvailableKeyboard(){assertEquals(Arrays.asList("limpar","j","o","a","o","espaço","2"),TextPlan.saimo("  João   2  "));}
 @Test(expected=IllegalArgumentException.class) public void rejectsUnsupportedSymbolsBeforeAnyInput(){TextPlan.saimo("Simpsons!");}
 @Test(expected=IllegalArgumentException.class) public void rejectsEmptyInput(){TextPlan.saimo("  ");}
 @Test(expected=IllegalArgumentException.class) public void boundsLocalPlan(){TextPlan.saimo("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");}
}
